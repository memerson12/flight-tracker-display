import { useEffect, useMemo, useRef, useState } from 'react';
import { type QueryFunctionContext, useQuery } from '@tanstack/react-query';

import { flightResponseSchema } from '@/lib/apiSchemas';
import {
  type DisplayScene,
  type FlightAvailabilityState,
  getDesiredDisplayScene,
  getNextFlightId,
  getSceneTransitionDelayMs,
  mergeFlightSnapshots,
  reconcileFlightAvailability
} from '@/lib/flightDisplayState';
import { getScheduledBrightness } from '@/lib/displayBrightness';
import { resolveTimeZone } from '@/lib/timeSettings';
import { normalizeEpochMilliseconds } from '@/lib/windowPosition';
import { Flight, Photo } from '@/types/flight';
import { SettingsResponse } from '@/types/settings';

import FlightCard from './FlightCard';
import PhotoSlideshow from './PhotoSlideshow';
import WindowPositionRail from './WindowPositionRail';

type FlightResponse = {
  flights: Flight[];
  source?: string;
  timestamp?: number;
};

type PhotoApiItem = {
  id: string;
  url: string;
  location?: string;
};

type FlightLayers = {
  current: Flight | null;
  previous: Flight | null;
  sequence: number;
};

const EMPTY_FLIGHTS: Flight[] = [];
const FLIGHT_ROTATION_MS = 15_000;
const MINIMUM_SCENE_DWELL_MS = 5_000;
const SUSPICIOUS_EMPTY_POLLS_REQUIRED = 3;
const FLIGHT_SWIPE_MS = 1100;
const REQUEST_TIMEOUT_MS = 12_000;
const FAILED_DATA_EXPIRY_MS = 120_000;

const fetchWithTimeout = async (url: string, signal?: AbortSignal) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
};

const fetchFlights = async ({ signal }: QueryFunctionContext): Promise<FlightResponse> => {
  const response = await fetchWithTimeout('/api/flights/overhead', signal);
  if (!response.ok) {
    throw new Error('Failed to load flights');
  }
  const payload = flightResponseSchema.parse(await response.json()) as FlightResponse;
  const observedAt = normalizeEpochMilliseconds(payload.timestamp) ?? Date.now();
  return {
    ...payload,
    flights: (payload.flights || []).map((flight) => ({
      ...flight,
      position: {
        ...flight.position,
        observedAt: normalizeEpochMilliseconds(flight.position.observedAt) ?? observedAt
      }
    }))
  };
};

const fetchPhotos = async ({ signal }: QueryFunctionContext): Promise<PhotoApiItem[]> => {
  const response = await fetchWithTimeout('/api/photos', signal);
  if (!response.ok) {
    throw new Error('Failed to load photos');
  }
  return response.json();
};

const fetchSettings = async ({ signal }: QueryFunctionContext): Promise<SettingsResponse> => {
  const response = await fetchWithTimeout('/api/settings', signal);
  if (!response.ok) {
    throw new Error('Failed to load settings');
  }
  return response.json();
};

const FlightStage = ({ flight, isLingering }: { flight: Flight | null; isLingering: boolean }) => {
  const [layers, setLayers] = useState<FlightLayers>({
    current: flight,
    previous: null,
    sequence: 0
  });

  useEffect(() => {
    if (!flight) {
      setLayers((previousLayers) => ({
        current: null,
        previous: null,
        sequence: previousLayers.sequence
      }));
      return;
    }

    setLayers((previousLayers) => {
      if (!previousLayers.current) {
        return { current: flight, previous: null, sequence: previousLayers.sequence };
      }

      if (previousLayers.current.id === flight.id) {
        return { ...previousLayers, current: flight };
      }

      return {
        current: flight,
        previous: previousLayers.current,
        sequence: previousLayers.sequence + 1
      };
    });
  }, [flight]);

  useEffect(() => {
    if (!layers.previous) return;

    const sequence = layers.sequence;
    const timer = window.setTimeout(() => {
      setLayers((previousLayers) => (
        previousLayers.sequence === sequence
          ? { ...previousLayers, previous: null }
          : previousLayers
      ));
    }, FLIGHT_SWIPE_MS);

    return () => window.clearTimeout(timer);
  }, [layers.previous, layers.sequence]);

  return (
    <div className="relative w-full h-full">
      {layers.previous && (
        <div className="flight-card-layer flight-card-exit" aria-hidden="true">
          <FlightCard flight={layers.previous} isLingering={isLingering} />
        </div>
      )}

      {layers.current && (
        <div
          key={`${layers.current.id}-${layers.sequence}`}
          className={`flight-card-layer ${layers.previous ? 'flight-card-enter' : ''}`}
        >
          <FlightCard flight={layers.current} isLingering={isLingering} />
        </div>
      )}
    </div>
  );
};

const FlightDisplay = () => {
  const [displayFlights, setDisplayFlights] = useState<Flight[]>([]);
  const [activeFlightId, setActiveFlightId] = useState<string | null>(null);
  const [displayScene, setDisplayScene] = useState<DisplayScene>('slideshow');
  const [hasConfirmedFlights, setHasConfirmedFlights] = useState(false);
  const [scheduleTime, setScheduleTime] = useState(() => Date.now());
  const sceneEnteredAtRef = useRef(Date.now());
  const initialSceneResolvedRef = useRef(false);
  const availabilityRef = useRef<FlightAvailabilityState>({
    hasFlights: false,
    consecutiveEmptyPolls: 0
  });

  const { data, dataUpdatedAt, isError, isRefetchError } = useQuery({
    queryKey: ['flights'],
    queryFn: fetchFlights,
    refetchInterval: (query) => {
      const flightCount = query.state.data?.flights?.length || 0;
      return flightCount > 0 || availabilityRef.current.hasFlights ? 15000 : 30000;
    },
    refetchIntervalInBackground: true
  });

  const { data: photoData, isError: isPhotoError } = useQuery({
    queryKey: ['photos'],
    queryFn: fetchPhotos,
    refetchInterval: 60000,
    refetchIntervalInBackground: true
  });

  const { data: settingsData, isError: isSettingsError } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
    refetchInterval: 10000,
    refetchIntervalInBackground: true
  });

  const liveFlights = data?.flights ?? EMPTY_FLIGHTS;
  const hasLiveFlights = liveFlights.length > 0;
  const showFlightLayer = displayScene === 'flights';
  const hasFlightQueryError = isError || isRefetchError;
  const flightDataAgeMs = dataUpdatedAt > 0 ? Math.max(0, scheduleTime - dataUpdatedAt) : null;
  const flightDataExpired = hasFlightQueryError
    && flightDataAgeMs !== null
    && flightDataAgeMs >= FAILED_DATA_EXPIRY_MS;

  const photos: Photo[] = useMemo(() => (
    (photoData ?? []).map((photo) => ({
      id: photo.id,
      src: photo.url,
      location: photo.location
    }))
  ), [photoData]);

  const healthMessage = useMemo(() => {
    if (hasFlightQueryError) {
      if (flightDataExpired || flightDataAgeMs === null) return 'FLIGHT DATA OFFLINE';
      const ageSeconds = Math.max(1, Math.round(flightDataAgeMs / 1000));
      return `FLIGHT DATA STALE · ${ageSeconds}s`;
    }
    if (isPhotoError && !hasConfirmedFlights) return 'PHOTO LIBRARY OFFLINE';
    if (isSettingsError) return 'DISPLAY SETTINGS OFFLINE';
    return null;
  }, [flightDataAgeMs, flightDataExpired, hasConfirmedFlights, hasFlightQueryError, isPhotoError, isSettingsError]);

  const flightIds = useMemo(
    () => displayFlights.map((flight) => flight.id),
    [displayFlights]
  );
  const flightIdSignature = flightIds.join('|');
  const rotatingFlightIdsRef = useRef(flightIds);
  rotatingFlightIdsRef.current = flightIds;

  const currentFlight = useMemo(
    () => displayFlights.find((flight) => flight.id === activeFlightId) ?? displayFlights[0] ?? null,
    [activeFlightId, displayFlights]
  );

  const slideshowInterval = settingsData?.slideshow?.interval ?? 10000;
  const slideshowShuffle = settingsData?.slideshow?.shuffle ?? true;
  const slideshowFit = settingsData?.slideshow?.fitMode ?? 'cover';
  const clockSettings = useMemo(() => ({
    use24Hour: settingsData?.clock?.use24Hour ?? true,
    timeZone: resolveTimeZone(
      settingsData?.clock?.timeZone,
      settingsData?.windowPosition?.latitude,
      settingsData?.windowPosition?.longitude
    )
  }), [
    settingsData?.clock?.timeZone,
    settingsData?.clock?.use24Hour,
    settingsData?.windowPosition?.latitude,
    settingsData?.windowPosition?.longitude
  ]);
  const displayBrightness = getScheduledBrightness(
    new Date(scheduleTime),
    settingsData?.display,
    clockSettings.timeZone
  );

  useEffect(() => {
    const scheduleTimer = window.setInterval(() => setScheduleTime(Date.now()), 15_000);
    return () => window.clearInterval(scheduleTimer);
  }, []);

  useEffect(() => {
    if (hasFlightQueryError || !data) return;

    const nextAvailability = reconcileFlightAvailability(
      availabilityRef.current,
      liveFlights.length,
      displayFlights.length,
      SUSPICIOUS_EMPTY_POLLS_REQUIRED
    );
    availabilityRef.current = nextAvailability;
    setHasConfirmedFlights(nextAvailability.hasFlights);

    if (!initialSceneResolvedRef.current) {
      initialSceneResolvedRef.current = true;
      sceneEnteredAtRef.current = Date.now();
      setDisplayScene(getDesiredDisplayScene(nextAvailability.hasFlights));
    }

    if (!hasLiveFlights) return;
    setDisplayFlights((previous) => mergeFlightSnapshots(previous, liveFlights));
    setActiveFlightId((previousId) => (
      previousId && liveFlights.some((flight) => flight.id === previousId)
        ? previousId
        : liveFlights[0].id
    ));
  }, [data, displayFlights.length, hasFlightQueryError, hasLiveFlights, liveFlights]);

  useEffect(() => {
    if (!flightDataExpired || !availabilityRef.current.hasFlights) return;
    availabilityRef.current = { hasFlights: false, consecutiveEmptyPolls: 0 };
    setHasConfirmedFlights(false);
  }, [flightDataExpired]);

  useEffect(() => {
    if (!initialSceneResolvedRef.current) return;
    const transitionDelay = getSceneTransitionDelayMs(
      displayScene,
      hasConfirmedFlights,
      sceneEnteredAtRef.current,
      Date.now(),
      MINIMUM_SCENE_DWELL_MS
    );
    if (transitionDelay === null) return;

    const desiredScene = getDesiredDisplayScene(hasConfirmedFlights);
    const switchScene = () => {
      sceneEnteredAtRef.current = Date.now();
      if (desiredScene === 'slideshow') {
        setDisplayFlights([]);
        setActiveFlightId(null);
      }
      setDisplayScene(desiredScene);
    };

    if (transitionDelay === 0) {
      switchScene();
      return;
    }

    const transitionTimer = window.setTimeout(switchScene, transitionDelay);
    return () => window.clearTimeout(transitionTimer);
  }, [displayScene, hasConfirmedFlights]);

  useEffect(() => {
    if (!showFlightLayer || rotatingFlightIdsRef.current.length < 2) return;

    const rotationTimer = window.setInterval(() => {
      setActiveFlightId((currentId) => getNextFlightId(rotatingFlightIdsRef.current, currentId));
    }, FLIGHT_ROTATION_MS);

    return () => window.clearInterval(rotationTimer);
  }, [flightIdSignature, showFlightLayer]);

  return (
    <main className="kiosk-display w-full h-screen bg-background overflow-hidden relative">
      <section
        className={`display-layer ${showFlightLayer ? 'display-layer-hidden' : 'display-layer-visible'}`}
        aria-hidden={showFlightLayer}
      >
        <PhotoSlideshow
          photos={photos}
          intervalMs={slideshowInterval}
          shuffle={slideshowShuffle}
          fitMode={slideshowFit}
          paused={showFlightLayer}
          clock={clockSettings}
        />
      </section>

      <section
        className={`display-layer ${showFlightLayer ? 'display-layer-visible' : 'display-layer-hidden'}`}
        aria-hidden={!showFlightLayer}
      >
        <FlightStage flight={currentFlight} isLingering={!hasConfirmedFlights && showFlightLayer} />

        {currentFlight && settingsData?.windowPosition?.enabled && (
          <WindowPositionRail flight={currentFlight} settings={settingsData.windowPosition} />
        )}

        {showFlightLayer && displayFlights.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-44">
            <div className="flight-rotation-track mb-2" aria-hidden="true">
              <div
                key={currentFlight?.id}
                className="flight-rotation-progress"
                style={{ animationDuration: `${FLIGHT_ROTATION_MS}ms` }}
              />
            </div>
            <div className="flex justify-center gap-2">
              {displayFlights.map((flight) => (
                <button
                  key={flight.id}
                  type="button"
                  aria-label={`Show flight ${flight.flightNumber}`}
                  onClick={() => setActiveFlightId(flight.id)}
                  className={`w-2 h-2 rounded-full transition-[width,background-color] duration-300 ${
                    flight.id === currentFlight?.id
                      ? 'bg-primary w-8'
                      : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {healthMessage && (
        <div
          role="status"
          className="absolute bottom-5 right-5 z-[900] rounded-full border border-white/20 bg-black/80 px-4 py-2 font-mono text-xs tracking-[0.16em] text-white/70"
        >
          {healthMessage}
        </div>
      )}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1000] bg-black transition-opacity duration-1000 ease-in-out"
        style={{ opacity: (100 - displayBrightness) / 100 }}
      />
    </main>
  );
};

export default FlightDisplay;
