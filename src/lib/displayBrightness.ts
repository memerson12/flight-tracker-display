import type { DisplaySettings } from '@/types/settings';

const DEFAULT_BRIGHTNESS = 100;
const DEFAULT_QUIET_BRIGHTNESS = 0;

const clampPercentage = (value: number | undefined, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, Math.round(value as number)));
};

export const parseClockMinutes = (time: string | undefined) => {
  const match = /^(\d{2}):(\d{2})$/.exec(time || '');
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return (hours * 60) + minutes;
};

const getMinutesInTimeZone = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const hours = Number(parts.find((part) => part.type === 'hour')?.value);
  const minutes = Number(parts.find((part) => part.type === 'minute')?.value);
  return (hours * 60) + minutes;
};

export const isQuietHoursActive = (
  date: Date,
  settings: DisplaySettings | undefined,
  timeZone: string
) => {
  const quietHours = settings?.quietHours;
  if (!quietHours?.enabled) return false;

  const start = parseClockMinutes(quietHours.start);
  const end = parseClockMinutes(quietHours.end);
  if (start === null || end === null || start === end) return false;

  const current = getMinutesInTimeZone(date, timeZone);
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
};

export const getScheduledBrightness = (
  date: Date,
  settings: DisplaySettings | undefined,
  timeZone: string
) => {
  const normalBrightness = clampPercentage(settings?.brightness, DEFAULT_BRIGHTNESS);
  if (!isQuietHoursActive(date, settings, timeZone)) return normalBrightness;
  return clampPercentage(settings?.quietHours?.brightness, DEFAULT_QUIET_BRIGHTNESS);
};
