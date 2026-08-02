const defaultSlideshowSettings = {
  interval: 10000,
  shuffle: true,
  fitMode: 'cover'
};

const defaultWindowPositionSettings = {
  enabled: false,
  address: '',
  latitude: null,
  longitude: null,
  bearing: 90,
  viewAngle: 90
};

const defaultClockSettings = {
  use24Hour: true,
  timeZone: ''
};

const defaultDisplaySettings = {
  brightness: 100,
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '07:00',
    brightness: 0
  }
};

const finiteOrNull = (value, minimum, maximum) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
};

const normalizeWindowPositionSettings = (input = {}, existing = {}) => {
  const merged = { ...defaultWindowPositionSettings, ...existing, ...input };
  const rawBearing = Number(merged.bearing);
  const bearing = Number.isFinite(rawBearing) ? ((rawBearing % 360) + 360) % 360 : 90;
  const rawViewAngle = Number(merged.viewAngle);

  return {
    enabled: Boolean(merged.enabled),
    address: String(merged.address || '').trim(),
    latitude: finiteOrNull(merged.latitude, -90, 90),
    longitude: finiteOrNull(merged.longitude, -180, 180),
    bearing,
    viewAngle: Number.isFinite(rawViewAngle) ? Math.min(180, Math.max(10, rawViewAngle)) : 90
  };
};

const isValidTimeZone = (timeZone) => {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
};

const normalizeClockSettings = (input = {}, existing = {}) => {
  const merged = { ...defaultClockSettings, ...existing, ...input };
  const timeZone = String(merged.timeZone || '').trim();
  return {
    use24Hour: merged.use24Hour === undefined ? true : Boolean(merged.use24Hour),
    timeZone: isValidTimeZone(timeZone) ? timeZone : ''
  };
};

const clampPercentage = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.round(parsed))) : fallback;
};

const normalizeTime = (value, fallback) => {
  const time = String(value || '').trim();
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : fallback;
};

const normalizeDisplaySettings = (input = {}, existing = {}) => {
  const existingQuietHours = existing.quietHours || {};
  const inputQuietHours = input.quietHours || {};
  const quietHours = {
    ...defaultDisplaySettings.quietHours,
    ...existingQuietHours,
    ...inputQuietHours
  };

  return {
    brightness: clampPercentage(
      input.brightness ?? existing.brightness,
      defaultDisplaySettings.brightness
    ),
    quietHours: {
      enabled: Boolean(quietHours.enabled),
      start: normalizeTime(quietHours.start, defaultDisplaySettings.quietHours.start),
      end: normalizeTime(quietHours.end, defaultDisplaySettings.quietHours.end),
      brightness: clampPercentage(
        quietHours.brightness,
        defaultDisplaySettings.quietHours.brightness
      )
    }
  };
};

module.exports = {
  defaultClockSettings,
  defaultDisplaySettings,
  defaultSlideshowSettings,
  defaultWindowPositionSettings,
  normalizeClockSettings,
  normalizeDisplaySettings,
  normalizeWindowPositionSettings
};
