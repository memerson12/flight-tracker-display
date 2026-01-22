import { useState, useEffect, useCallback } from 'react';
import { Flight, Photo } from '@/types/flight';
import FlightCard from './FlightCard';
import PhotoSlideshow from './PhotoSlideshow';
import { sampleFlights, samplePhotos } from '@/data/sampleFlights';
import { Plane, Camera, RefreshCw } from 'lucide-react';

type DisplayMode = 'flight' | 'photos';

const FlightDisplay = () => {
  const [mode, setMode] = useState<DisplayMode>('flight');
  const [currentFlight, setCurrentFlight] = useState<Flight | null>(sampleFlights[0]);
  const [flightIndex, setFlightIndex] = useState(0);
  const [photos] = useState<Photo[]>(samplePhotos);
  const [isDemo, setIsDemo] = useState(true);

  // Cycle through demo flights every 15 seconds
  useEffect(() => {
    if (!isDemo || mode !== 'flight') return;

    const timer = setInterval(() => {
      setFlightIndex((prev) => {
        const next = (prev + 1) % sampleFlights.length;
        setCurrentFlight(sampleFlights[next]);
        return next;
      });
    }, 15000);

    return () => clearInterval(timer);
  }, [isDemo, mode]);

  // Toggle mode for demo purposes
  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === 'flight' ? 'photos' : 'flight'));
  }, []);

  return (
    <div className="w-full h-screen bg-background overflow-hidden relative">
      {/* Mode indicator and controls */}
      <div className="absolute top-4 left-4 z-50 flex items-center gap-3">
        <button
          onClick={toggleMode}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/80 backdrop-blur-sm border border-border/50 hover:bg-secondary transition-colors"
        >
          {mode === 'flight' ? (
            <>
              <Camera className="w-4 h-4 text-primary" />
              <span className="text-sm text-foreground/80">View Photos</span>
            </>
          ) : (
            <>
              <Plane className="w-4 h-4 text-primary" />
              <span className="text-sm text-foreground/80">View Flights</span>
            </>
          )}
        </button>
        
        {isDemo && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-aviation-amber/20 border border-aviation-amber/30">
            <RefreshCw className="w-3 h-3 text-aviation-amber animate-spin" style={{ animationDuration: '3s' }} />
            <span className="text-xs text-aviation-amber font-medium">DEMO MODE</span>
          </div>
        )}
      </div>

      {/* Main display */}
      <div className="w-full h-full">
        {mode === 'flight' && currentFlight ? (
          <FlightCard flight={currentFlight} key={currentFlight.id} />
        ) : (
          <PhotoSlideshow photos={photos} />
        )}
      </div>

      {/* Flight pagination dots (when in flight mode) */}
      {mode === 'flight' && sampleFlights.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
          {sampleFlights.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                setFlightIndex(index);
                setCurrentFlight(sampleFlights[index]);
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
