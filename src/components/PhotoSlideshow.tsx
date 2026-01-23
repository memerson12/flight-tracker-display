import { useEffect, useRef, useState } from 'react';
import { Photo } from '@/types/flight';

interface PhotoSlideshowProps {
  photos: Photo[];
  intervalMs?: number;
  fitMode?: 'cover' | 'contain';
  shuffle?: boolean;
}

const PhotoSlideshow = ({
  photos,
  intervalMs = 10000,
  fitMode = 'cover',
  shuffle = true
}: PhotoSlideshowProps) => {
  const [activeLayer, setActiveLayer] = useState<'A' | 'B'>('A');
  const [layerAIndex, setLayerAIndex] = useState(0);
  const [layerBIndex, setLayerBIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [hiddenReady, setHiddenReady] = useState(false);
  const [clockCorner, setClockCorner] = useState<'left' | 'right'>('right');
  const [dotsCorner, setDotsCorner] = useState<'left' | 'right'>('right');
  const [drift, setDrift] = useState({ x: 0, y: 0 });
  const swapGuardRef = useRef(false);

  const pickNextIndex = (excludeIndex: number) => {
    if (!shuffle) {
      return (excludeIndex + 1) % photos.length;
    }

    if (photos.length === 2) {
      return excludeIndex === 0 ? 1 : 0;
    }

    let next = excludeIndex;
    while (next === excludeIndex) {
      next = Math.floor(Math.random() * photos.length);
    }
    return next;
  };

  useEffect(() => {
    if (photos.length === 0) return;
    setActiveLayer('A');
    setLayerAIndex(0);
    const upcoming = photos.length > 1 ? pickNextIndex(0) : 0;
    setLayerBIndex(upcoming);
    setHiddenReady(false);
    setIsTransitioning(false);
  }, [photos]);

  useEffect(() => {
    const timer = setInterval(() => {
      setClockCorner((prev) => (prev === 'right' ? 'left' : 'right'));
      setDotsCorner((prev) => (prev === 'right' ? 'left' : 'right'));
    }, 180000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const offset = () => Math.round((Math.random() * 16 - 8));
      setDrift({ x: offset(), y: offset() });
    }, 90000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (photos.length <= 1) {
      setHiddenReady(true);
      return;
    }

    const hiddenIndex = activeLayer === 'A' ? layerBIndex : layerAIndex;
    if (hiddenIndex === undefined) return;

    setHiddenReady(false);
    const img = new Image();
    img.src = photos[hiddenIndex].src;
    img.onload = () => setHiddenReady(true);
    img.onerror = () => setHiddenReady(true);
  }, [activeLayer, layerAIndex, layerBIndex, photos]);

  useEffect(() => {
    if (photos.length <= 1) return;
    if (!hiddenReady || isTransitioning) return;

    const timer = setTimeout(() => {
      if (!hiddenReady || isTransitioning) return;
      setIsTransitioning(true);
    }, intervalMs);

    return () => clearTimeout(timer);
  }, [photos.length, intervalMs, hiddenReady, isTransitioning, activeLayer, layerAIndex, layerBIndex]);

  if (photos.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-muted-foreground text-xl">No photos to display</p>
      </div>
    );
  }

  const currentIndex = activeLayer === 'A' ? layerAIndex : layerBIndex;
  const hiddenIndex = activeLayer === 'A' ? layerBIndex : layerAIndex;
  const currentPhoto = photos[currentIndex];
  const upcomingPhoto = photos[hiddenIndex] ?? currentPhoto;

  const handleTransitionEnd = () => {
    if (!isTransitioning || swapGuardRef.current) return;
    swapGuardRef.current = true;

    if (activeLayer === 'A') {
      setActiveLayer('B');
      const upcoming = pickNextIndex(layerBIndex);
      setLayerAIndex(upcoming);
    } else {
      setActiveLayer('A');
      const upcoming = pickNextIndex(layerAIndex);
      setLayerBIndex(upcoming);
    }

    setHiddenReady(false);
    setIsTransitioning(false);
    requestAnimationFrame(() => {
      swapGuardRef.current = false;
    });
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Current photo */}
      <div
        className={`absolute inset-0 transition-opacity duration-1200 ease-in-out ${
          activeLayer === 'A'
            ? isTransitioning
              ? 'opacity-0'
              : 'opacity-100'
            : isTransitioning
              ? 'opacity-100'
              : 'opacity-0'
        }`}
      >
        <img
          src={photos[layerAIndex]?.src}
          alt={photos[layerAIndex]?.caption || 'Family photo'}
          className={`w-full h-full ${fitMode === 'contain' ? 'object-contain' : 'object-cover'}`}
        />
        
        {/* Gradient overlay for text */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        
        {/* Caption */}
        {photos[layerAIndex]?.caption && (
          <div className="absolute bottom-8 left-8 right-8">
            <p className="text-2xl text-white/90 font-light tracking-wide">
              {photos[layerAIndex]?.caption}
            </p>
          </div>
        )}
      </div>

      <div
        className={`absolute inset-0 transition-opacity duration-1200 ease-in-out ${
          activeLayer === 'B'
            ? isTransitioning
              ? 'opacity-0'
              : 'opacity-100'
            : isTransitioning
              ? 'opacity-100'
              : 'opacity-0'
        }`}
        onTransitionEnd={handleTransitionEnd}
      >
        <img
          src={photos[layerBIndex]?.src}
          alt={photos[layerBIndex]?.caption || 'Family photo'}
          className={`w-full h-full ${fitMode === 'contain' ? 'object-contain' : 'object-cover'}`}
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

        {photos[layerBIndex]?.caption && (
          <div className="absolute bottom-8 left-8 right-8">
            <p className="text-2xl text-white/90 font-light tracking-wide">
              {photos[layerBIndex]?.caption}
            </p>
          </div>
        )}
      </div>

      {/* Photo indicators */}
      <div
        className={`absolute bottom-8 ${dotsCorner === 'right' ? 'right-8' : 'left-8'} flex gap-2 transition-all duration-500`}
        style={{ transform: `translate(${drift.x}px, ${drift.y}px)` }}
      >
        {photos.map((_, index) => (
          <div
            key={index}
            className={`w-2 h-2 rounded-full transition-all duration-500 ${
              index === currentIndex
                ? 'bg-white/80 w-6'
                : 'bg-white/40'
            }`}
          />
        ))}
      </div>

      {/* Clock overlay */}
      <div
        className={`absolute top-8 ${clockCorner === 'right' ? 'right-8' : 'left-8'} transition-all duration-500`}
        style={{ transform: `translate(${drift.x}px, ${drift.y}px)` }}
      >
        <Clock />
      </div>
    </div>
  );
};

const Clock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="text-right">
      <div className="font-mono text-5xl font-light text-white/80 tracking-wider">
        {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div className="text-lg text-white/50 mt-1">
        {time.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
      </div>
    </div>
  );
};

export default PhotoSlideshow;
