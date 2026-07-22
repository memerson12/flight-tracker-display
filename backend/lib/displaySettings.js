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

module.exports = {
  defaultClockSettings,
  defaultSlideshowSettings,
  defaultWindowPositionSettings,
  normalizeClockSettings,
  normalizeWindowPositionSettings
};
