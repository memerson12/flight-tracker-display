import tzLookup from 'tz-lookup';

export type ClockFormatOptions = {
  use24Hour?: boolean;
  timeZone?: string;
};

export const isValidTimeZone = (timeZone?: string) => {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
};

export const inferTimeZone = (latitude?: number | null, longitude?: number | null) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  try {
    return tzLookup(Number(latitude), Number(longitude));
  } catch {
    return '';
  }
};

export const resolveTimeZone = (
  configuredTimeZone?: string,
  latitude?: number | null,
  longitude?: number | null
) => {
  if (isValidTimeZone(configuredTimeZone)) return configuredTimeZone as string;
  const inferred = inferTimeZone(latitude, longitude);
  if (inferred) return inferred;
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
};

export const formatClockTime = (date: Date, options: ClockFormatOptions) => (
  new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: !(options.use24Hour ?? true),
    timeZone: options.timeZone
  }).format(date)
);

export const formatClockDate = (date: Date, options: ClockFormatOptions) => (
  new Intl.DateTimeFormat('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: options.timeZone
  }).format(date)
);
