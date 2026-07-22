import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { samplePhotos } from '@/data/sampleFlights';
import {
  getNextFlightId,
  getRemainingLingerMs,
  mergeFlightSnapshots
} from '@/lib/flightDisplayState';
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
  caption?: string;
};

type FlightLayers = {
  current: Flight | null;
  previous: Flight | null;
  sequence: number;
};

const EMPTY_FLIGHTS: Flight[] = [];
const FLIGHT_ROTATION_MS = 15_000;
const FLIGHT_LINGER_MS = 45_000;
const FLIGHT_SWIPE_MS = 1100;

const fetchFlights = async (): Promise<FlightResponse> => {
  const response = await fetch('/api/flights/overhead');
  if (!response.ok) {
    throw new Error('Failed to load flights');
  }
  return response.json();
};

const fetchPhotos = async (): Promise<PhotoApiItem[]> => {
  const response = await fetch('/api/photos');
  if (!response.ok) {
    throw new Error('Failed to load photos');
  }
  return response.json();
};

const fetchSettings = async (): Promise<SettingsResponse> => {
  const response = await fetch('/api/settings');
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
    if (!flight) return;

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
  const [showFlightLayer, setShowFlightLayer] = useState(false);
  const emptySinceRef = useRef<number | null>(null);

  const { data, isError } = useQuery({
    queryKey: ['flights'],
    queryFn: fetchFlights,
    refetchInterval: (query) => {
      const flightCount = query.state.data?.flights?.length || 0;
      return flightCount > 0 ? 15000 : 30000;
    },
    refetchIntervalInBackground: true
  });

  const { data: photoData } = useQuery({
    queryKey: ['photos'],
    queryFn: fetchPhotos,
    refetchInterval: 60000,
    refetchIntervalInBackground: true
  });

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
    refetchInterval: 10000,
    refetchIntervalInBackground: true
  });

  const liveFlights = isError ? EMPTY_FLIGHTS : (data?.flights ?? EMPTY_FLIGHTS);
  const hasLiveFlights = liveFlights.length > 0;

  const photos: Photo[] = useMemo(() => (
    (photoData ?? samplePhotos).map((photo) => ({
      id: photo.id,
      src: (photo as PhotoApiItem).url ?? (photo as Photo).src,
      caption: photo.caption
    }))
  ), [photoData]);

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

  useEffect(() => {
    if (hasLiveFlights) {
      emptySinceRef.current = null;
      setDisplayFlights((previous) => mergeFlightSnapshots(previous, liveFlights));
      setActiveFlightId((previousId) => (
        previousId && liveFlights.some((flight) => flight.id === previousId)
          ? previousId
          : liveFlights[0].id
      ));
      setShowFlightLayer(true);
      return;
    }

    if (displayFlights.length === 0) {
      emptySinceRef.current = null;
      setShowFlightLayer(false);
      return;
    }

    if (emptySinceRef.current === null) {
      emptySinceRef.current = Date.now();
    }

    const remainingLinger = getRemainingLingerMs(
      emptySinceRef.current,
      Date.now(),
      FLIGHT_LINGER_MS
    );
    const lingerTimer = window.setTimeout(() => {
      setShowFlightLayer(false);
    }, remainingLinger);

    return () => window.clearTimeout(lingerTimer);
  }, [displayFlights.length, hasLiveFlights, liveFlights]);

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
        />
      </section>

      <section
        className={`display-layer ${showFlightLayer ? 'display-layer-visible' : 'display-layer-hidden'}`}
        aria-hidden={!showFlightLayer}
      >
        <FlightStage flight={currentFlight} isLingering={!hasLiveFlights && showFlightLayer} />

        {currentFlight && settingsData?.windowPosition?.enabled && (
          <WindowPositionRail flight={currentFlight} settings={settingsData.windowPosition} />
        )}

        {displayFlights.length > 1 && (
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
    </main>
  );
};

export default FlightDisplay;
