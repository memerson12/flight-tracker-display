import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { samplePhotos } from '@/data/sampleFlights';
import { Flight, Photo } from '@/types/flight';

import FlightCard from './FlightCard';
import PhotoSlideshow from './PhotoSlideshow';

type DisplayMode = 'flight' | 'photos';

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

type SettingsResponse = {
  slideshow?: {
    interval?: number;
    shuffle?: boolean;
    fitMode?: 'cover' | 'contain';
  };
};

const emptyThreshold = 3;

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

const FlightDisplay = () => {
  const [currentFlight, setCurrentFlight] = useState<Flight | null>(null);
  const [flightIndex, setFlightIndex] = useState(0);
  const [emptyStreak, setEmptyStreak] = useState(0);

  const { data, isError, dataUpdatedAt } = useQuery({
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
    refetchInterval: 60000,
    refetchIntervalInBackground: true
  });

  const flights = data?.flights ?? [];
  const hasFlights = flights.length > 0;
  const photos: Photo[] = (photoData ?? samplePhotos).map((photo) => ({
    id: photo.id,
    src: (photo as PhotoApiItem).url ?? (photo as Photo).src,
    caption: photo.caption
  }));
  const slideshowInterval = settingsData?.slideshow?.interval ?? 10000;
  const slideshowShuffle = settingsData?.slideshow?.shuffle ?? true;
  const slideshowFit = settingsData?.slideshow?.fitMode ?? 'cover';

  useEffect(() => {
    if (isError) {
      setEmptyStreak(emptyThreshold);
      return;
    }

    setEmptyStreak((prev) => (hasFlights ? 0 : prev + 1));
  }, [hasFlights, isError, dataUpdatedAt]);

  useEffect(() => {
    if (!hasFlights) {
      setCurrentFlight(null);
      return;
    }

    const safeIndex = Math.min(flightIndex, flights.length - 1);
    setFlightIndex(safeIndex);
    setCurrentFlight(flights[safeIndex]);
  }, [flights, flightIndex, hasFlights]);

  useEffect(() => {
    if (!hasFlights || flights.length < 2) return;

    const timer = setInterval(() => {
      setFlightIndex((prev) => {
        const next = (prev + 1) % flights.length;
        setCurrentFlight(flights[next]);
        return next;
      });
    }, 15000);

    return () => clearInterval(timer);
  }, [flights, hasFlights]);

  const mode: DisplayMode = hasFlights || emptyStreak < emptyThreshold ? 'flight' : 'photos';

  return (
    <div className="w-full h-screen bg-background overflow-hidden relative">
      {/* Main display */}
      <div className="w-full h-full">
        {mode === 'flight' ? (
          currentFlight ? (
            <FlightCard flight={currentFlight} key={currentFlight.id} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-lg">
               Looking for flights overhead...
            </div>
          )
        ) : (
          <PhotoSlideshow
            photos={photos}
            intervalMs={slideshowInterval}
            shuffle={slideshowShuffle}
            fitMode={slideshowFit}
          />
        )}
      </div>

      {/* Flight pagination dots (when in flight mode) */}
      {mode === 'flight' && flights.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
          {flights.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                setFlightIndex(index);
                setCurrentFlight(flights[index]);
              }}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                index === flightIndex
                  ? 'bg-primary w-8'
                  : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default FlightDisplay;
