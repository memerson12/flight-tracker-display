import { useState, useEffect } from 'react';
import { Photo } from '@/types/flight';

interface PhotoSlideshowProps {
  photos: Photo[];
  intervalMs?: number;
}

const PhotoSlideshow = ({ photos, intervalMs = 10000 }: PhotoSlideshowProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [displayIndex, setDisplayIndex] = useState(0);

  useEffect(() => {
    if (photos.length <= 1) return;

    const timer = setInterval(() => {
      setIsTransitioning(true);
      
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % photos.length);
        setDisplayIndex((prev) => (prev + 1) % photos.length);
        setIsTransitioning(false);
      }, 2000);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [photos.length, intervalMs]);

  if (photos.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-muted-foreground text-xl">No photos to display</p>
      </div>
    );
  }

  const currentPhoto = photos[displayIndex];

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Current photo */}
      <div
        className={`absolute inset-0 transition-opacity duration-2000 ease-in-out ${
          isTransitioning ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <img
          src={currentPhoto.src}
          alt={currentPhoto.caption || 'Family photo'}
          className="w-full h-full object-cover"
        />
        
        {/* Gradient overlay for text */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        
        {/* Caption */}
        {currentPhoto.caption && (
          <div className="absolute bottom-8 left-8 right-8">
            <p className="text-2xl text-white/90 font-light tracking-wide">
              {currentPhoto.caption}
            </p>
          </div>
        )}
      </div>

      {/* Photo indicators */}
      <div className="absolute bottom-8 right-8 flex gap-2">
        {photos.map((_, index) => (
          <div
            key={index}
            className={`w-2 h-2 rounded-full transition-all duration-500 ${
              index === displayIndex
                ? 'bg-white w-6'
                : 'bg-white/30'
            }`}
          />
        ))}
      </div>

      {/* Clock overlay */}
      <div className="absolute top-8 right-8">
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
      <div className="font-mono text-5xl font-light text-white/90 tracking-wider">
        {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div className="text-lg text-white/60 mt-1">
        {time.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
      </div>
    </div>
  );
};

export default PhotoSlideshow;
