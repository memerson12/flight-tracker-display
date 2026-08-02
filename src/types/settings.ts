export type SlideshowSettings = {
  interval?: number;
  shuffle?: boolean;
  fitMode?: 'cover' | 'contain';
};

export type WindowPositionSettings = {
  enabled?: boolean;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  bearing?: number;
  viewAngle?: number;
};

export type ClockSettings = {
  use24Hour?: boolean;
  timeZone?: string;
};

export type DisplaySettings = {
  brightness?: number;
  quietHours?: {
    enabled?: boolean;
    start?: string;
    end?: string;
    brightness?: number;
  };
};

export type SettingsResponse = {
  slideshow?: SlideshowSettings;
  windowPosition?: WindowPositionSettings;
  clock?: ClockSettings;
  display?: DisplaySettings;
};
