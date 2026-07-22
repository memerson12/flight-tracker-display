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

export type SettingsResponse = {
  slideshow?: SlideshowSettings;
  windowPosition?: WindowPositionSettings;
  clock?: ClockSettings;
};
