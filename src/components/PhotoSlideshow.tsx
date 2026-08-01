import { useCallback, useEffect, useId, useRef, useState } from 'react';

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
    <div className="relative isolate w-full h-full overflow-hidden bg-black">
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
        className={`absolute top-8 ${clockCorner === 'right' ? 'right-8' : 'left-8'} transition-all duration-700`}
      >
        <Clock align={clockCorner} settings={clock} drift={drift} />
      </div>
    </div>
  );
};

const Clock = ({
  align,
  settings,
  drift
}: {
  align: Corner;
  settings: ClockSettings;
  drift: { x: number; y: number };
}) => {
  const [time, setTime] = useState(new Date());
  const clipId = `adaptive-clock-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const clockTime = formatClockTime(time, settings).toUpperCase();
  const clockDate = formatClockDate(time, settings);
  const maskPadding = 16;
  const textAnchor = align === 'right' ? 'end' : 'start';
  const textX = align === 'right' ? 260 + maskPadding : maskPadding;

  return (
    <>
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <text
              x={textX}
              y={46 + maskPadding}
              textAnchor={textAnchor}
              fontFamily="JetBrains Mono, monospace"
              fontSize="48"
              fontWeight="300"
              letterSpacing="0.05em"
            >
              {clockTime}
            </text>
            <text
              x={textX}
              y={75 + maskPadding}
              textAnchor={textAnchor}
              fontFamily="Inter, system-ui, sans-serif"
              fontSize="18"
              fontWeight="400"
            >
              {clockDate}
            </text>
          </clipPath>
        </defs>
      </svg>
      <div
        className="relative h-[82px] w-[260px] select-none"
        role="timer"
        aria-label={`${clockTime}, ${clockDate}`}
      >
        <div
          className="absolute -inset-4 bg-white transition-transform duration-700"
          aria-hidden="true"
          style={{
            clipPath: `url(#${clipId})`,
            filter: 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.95)) drop-shadow(0 0 1px rgb(0 0 0 / 0.7))',
            transform: `translate(${drift.x}px, ${drift.y}px)`
          }}
        />
      </div>
    </>
  );
};

export default PhotoSlideshow;
