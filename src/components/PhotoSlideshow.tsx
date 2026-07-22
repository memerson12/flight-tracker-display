import { useCallback, useEffect, useRef, useState } from 'react';

import { formatClockDate, formatClockTime } from '@/lib/timeSettings';
import { Photo } from '@/types/flight';
import { ClockSettings } from '@/types/settings';

interface PhotoSlideshowProps {
  photos: Photo[];
  intervalMs?: number;
  fitMode?: 'cover' | 'contain';
  shuffle?: boolean;
  paused?: boolean;
  clock?: ClockSettings;
}

type Corner = 'left' | 'right';
type PhotoOrientation = 'landscape' | 'portrait';

interface PhotoLayerProps {
  photo?: Photo;
  fitMode: 'cover' | 'contain';
  orientation?: PhotoOrientation;
  clockCorner: Corner;
  className: string;
  onLoad: (photo: Photo, image: HTMLImageElement) => void;
  onTransitionEnd?: () => void;
}

const PhotoLayer = ({
  photo,
  fitMode,
  orientation,
  clockCorner,
  className,
  onLoad,
  onTransitionEnd
}: PhotoLayerProps) => {
  if (!photo) return null;

  const usePortraitLayout = fitMode === 'contain' && orientation === 'portrait';
  const portraitSide = clockCorner === 'right' ? 'left' : 'right';
  const captionSide = usePortraitLayout ? clockCorner : clockCorner === 'right' ? 'left' : 'right';

  return (
    <div className={`photo-layer absolute inset-0 ${className}`} onTransitionEnd={onTransitionEnd}>
      <div className={usePortraitLayout
        ? `photo-portrait-stage ${portraitSide === 'left' ? 'photo-portrait-left' : 'photo-portrait-right'}`
        : 'absolute inset-0'}>
        <img
          src={photo.src}
          alt={photo.caption || 'Family photo'}
          className={usePortraitLayout
            ? 'h-full w-auto max-w-[62vw] object-contain'
            : `w-full h-full ${fitMode === 'contain' ? 'object-contain' : 'object-cover'}`}
          onLoad={(event) => onLoad(photo, event.currentTarget)}
        />
      </div>

      <div className={usePortraitLayout
        ? 'absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent'
        : 'absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10'}
      />

      {photo.caption && (
        <div className={`${usePortraitLayout ? 'absolute bottom-24 w-[30%]' : 'absolute bottom-8 max-w-[62%]'} ${
          captionSide === 'right' ? 'right-8 text-right' : 'left-8 text-left'
        }`}
        >
          <p className={`text-white/90 font-light tracking-wide ${usePortraitLayout ? 'text-3xl leading-tight' : 'text-2xl'}`}>
            {photo.caption}
          </p>
        </div>
      )}
    </div>
  );
};

const PhotoSlideshow = ({
  photos,
  intervalMs = 10000,
  fitMode = 'cover',
  shuffle = true,
  paused = false,
  clock = { use24Hour: true }
}: PhotoSlideshowProps) => {
  const [activeLayer, setActiveLayer] = useState<'A' | 'B'>('A');
  const [layerAIndex, setLayerAIndex] = useState(0);
  const [layerBIndex, setLayerBIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [hiddenReady, setHiddenReady] = useState(false);
  const [clockCorner, setClockCorner] = useState<Corner>('right');
  const [drift, setDrift] = useState({ x: 0, y: 0 });
  const [orientations, setOrientations] = useState<Record<string, PhotoOrientation>>({});
  const swapGuardRef = useRef(false);
  const shuffleQueueRef = useRef<number[]>([]);
  const photoSignature = photos.map((photo) => `${photo.id}:${photo.src}`).join('|');

  const rememberOrientation = useCallback((photo: Photo, image: HTMLImageElement) => {
    const orientation = image.naturalHeight > image.naturalWidth ? 'portrait' : 'landscape';
    setOrientations((current) => current[photo.id] === orientation
      ? current
      : { ...current, [photo.id]: orientation });
  }, []);

  const shuffleIndices = useCallback((indices: number[]) => {
    const next = [...indices];
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  }, []);

  const refillShuffleQueue = useCallback((excludeIndex: number) => {
    const indices = Array.from({ length: photos.length }, (_, index) => index)
      .filter((index) => index !== excludeIndex);
    shuffleQueueRef.current = shuffleIndices(indices);
  }, [photos.length, shuffleIndices]);

  const pickNextIndex = useCallback((excludeIndex: number) => {
    if (!shuffle) return (excludeIndex + 1) % photos.length;
    if (photos.length === 2) return excludeIndex === 0 ? 1 : 0;

    if (shuffleQueueRef.current.length === 0) refillShuffleQueue(excludeIndex);
    return shuffleQueueRef.current.shift() ?? excludeIndex;
  }, [photos.length, refillShuffleQueue, shuffle]);

  useEffect(() => {
    if (photos.length === 0) return;
    setActiveLayer('A');
    setLayerAIndex(0);
    shuffleQueueRef.current = [];
    setLayerBIndex(photos.length > 1 ? pickNextIndex(0) : 0);
    setHiddenReady(false);
    setIsTransitioning(false);
  }, [photoSignature, photos.length, pickNextIndex]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockCorner((current) => current === 'right' ? 'left' : 'right');
    }, 180000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const offset = () => Math.round(Math.random() * 16 - 8);
      setDrift({ x: offset(), y: offset() });
    }, 90000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (photos.length <= 1) {
      setHiddenReady(true);
      return;
    }

    const hiddenIndex = activeLayer === 'A' ? layerBIndex : layerAIndex;
    const hiddenPhoto = photos[hiddenIndex];
    if (!hiddenPhoto) return;

    setHiddenReady(false);
    const image = new Image();
    image.src = hiddenPhoto.src;
    image.onload = () => {
      rememberOrientation(hiddenPhoto, image);
      setHiddenReady(true);
    };
    image.onerror = () => setHiddenReady(true);
  }, [activeLayer, layerAIndex, layerBIndex, photos, rememberOrientation]);

  useEffect(() => {
    if (paused || photos.length <= 1 || !hiddenReady || isTransitioning) return;

    const timer = window.setTimeout(() => setIsTransitioning(true), intervalMs);
    return () => window.clearTimeout(timer);
  }, [activeLayer, hiddenReady, intervalMs, isTransitioning, layerAIndex, layerBIndex, paused, photos.length]);

  if (photos.length === 0) return <div className="w-full h-full bg-black" aria-hidden="true" />;

  const currentIndex = activeLayer === 'A' ? layerAIndex : layerBIndex;
  const hiddenIndex = activeLayer === 'A' ? layerBIndex : layerAIndex;
  const indicatorIndex = isTransitioning ? hiddenIndex : currentIndex;
  const indicatorPhoto = photos[indicatorIndex];
  const indicatorIsPortrait = fitMode === 'contain' && orientations[indicatorPhoto?.id] === 'portrait';

  const handleTransitionEnd = () => {
    if (!isTransitioning || swapGuardRef.current) return;
    swapGuardRef.current = true;

    if (activeLayer === 'A') {
      setActiveLayer('B');
      setLayerAIndex(pickNextIndex(layerBIndex));
    } else {
      setActiveLayer('A');
      setLayerBIndex(pickNextIndex(layerAIndex));
    }

    setHiddenReady(false);
    setIsTransitioning(false);
    requestAnimationFrame(() => { swapGuardRef.current = false; });
  };

  const layerAClass = `transition-opacity duration-1000 ease-in-out ${
    activeLayer === 'A' ? (isTransitioning ? 'opacity-0' : 'opacity-100') : (isTransitioning ? 'opacity-100' : 'opacity-0')
  }`;
  const layerBClass = `transition-opacity duration-1000 ease-in-out ${
    activeLayer === 'B' ? (isTransitioning ? 'opacity-0' : 'opacity-100') : (isTransitioning ? 'opacity-100' : 'opacity-0')
  }`;

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <PhotoLayer
        photo={photos[layerAIndex]}
        fitMode={fitMode}
        orientation={orientations[photos[layerAIndex]?.id]}
        clockCorner={clockCorner}
        className={layerAClass}
        onLoad={rememberOrientation}
      />
      <PhotoLayer
        photo={photos[layerBIndex]}
        fitMode={fitMode}
        orientation={orientations[photos[layerBIndex]?.id]}
        clockCorner={clockCorner}
        className={layerBClass}
        onLoad={rememberOrientation}
        onTransitionEnd={handleTransitionEnd}
      />

      <div
        className="absolute bottom-8 flex gap-2 transition-all duration-700"
        style={indicatorIsPortrait
          ? { left: clockCorner === 'right' ? '46%' : '54%', transform: `translate(-50%, 0) translate(${drift.x}px, ${drift.y}px)` }
          : { [clockCorner]: '2rem', transform: `translate(${drift.x}px, ${drift.y}px)` }}
      >
        {photos.map((photo, index) => (
          <div key={photo.id} className="w-6 h-2 flex items-center justify-center">
            <div className={`h-2 rounded-full transition-[width,background-color] duration-500 ${
              index === indicatorIndex ? 'bg-white/80 w-6' : 'bg-white/40 w-2'
            }`} />
          </div>
        ))}
      </div>

      <div
        className={`absolute top-8 ${clockCorner === 'right' ? 'right-8' : 'left-8'} transition-all duration-700`}
        style={{ transform: `translate(${drift.x}px, ${drift.y}px)` }}
      >
        <Clock align={clockCorner} settings={clock} />
      </div>
    </div>
  );
};

const Clock = ({ align, settings }: { align: Corner; settings: ClockSettings }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={align === 'right' ? 'text-right' : 'text-left'}>
      <div className="font-mono text-5xl font-light text-white/80 tracking-wider uppercase">
        {formatClockTime(time, settings)}
      </div>
      <div className="text-lg text-white/50 mt-1">
        {formatClockDate(time, settings)}
      </div>
    </div>
  );
};

export default PhotoSlideshow;
