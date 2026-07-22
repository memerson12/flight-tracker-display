export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export type WindowBearingPosition = {
  bearing: number;
  percent: number;
  visible: boolean;
  edge: 'left' | 'right' | null;
};

const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_NAUTICAL_MILE = 1852;
export const MAX_PROJECTION_MS = 30_000;

export const normalizeBearing = (bearing: number) => ((bearing % 360) + 360) % 360;

export const getSignedBearingDelta = (bearing: number, centerBearing: number) => (
  ((normalizeBearing(bearing) - normalizeBearing(centerBearing) + 540) % 360) - 180
);

export const getCompassLabel = (bearing: number) => {
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return labels[Math.round(normalizeBearing(bearing) / 45) % labels.length];
};

export const calculateBearing = (observer: GeoPoint, target: GeoPoint) => {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const observerLatitude = toRadians(observer.latitude);
  const targetLatitude = toRadians(target.latitude);
  const longitudeDelta = toRadians(target.longitude - observer.longitude);
  const y = Math.sin(longitudeDelta) * Math.cos(targetLatitude);
  const x = (
    Math.cos(observerLatitude) * Math.sin(targetLatitude)
    - Math.sin(observerLatitude) * Math.cos(targetLatitude) * Math.cos(longitudeDelta)
  );

  return normalizeBearing(Math.atan2(y, x) * 180 / Math.PI);
};

export const normalizeEpochMilliseconds = (timestamp?: number | null) => {
  const parsed = Number(timestamp);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
};

export const projectPosition = (
  point: GeoPoint,
  headingDegrees: number,
  speedKnots: number,
  elapsedMs: number,
  maximumElapsedMs = MAX_PROJECTION_MS
): GeoPoint => {
  if (
    !Number.isFinite(point.latitude)
    || !Number.isFinite(point.longitude)
    || !Number.isFinite(headingDegrees)
    || !Number.isFinite(speedKnots)
    || speedKnots <= 0
  ) {
    return point;
  }

  const projectedMs = Math.min(maximumElapsedMs, Math.max(0, elapsedMs));
  if (projectedMs === 0) return point;

  const distanceMeters = speedKnots * METERS_PER_NAUTICAL_MILE * projectedMs / 3_600_000;
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
  const heading = headingDegrees * Math.PI / 180;
  const latitude = point.latitude * Math.PI / 180;
  const longitude = point.longitude * Math.PI / 180;

  const projectedLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance)
    + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(heading)
  );
  const projectedLongitude = longitude + Math.atan2(
    Math.sin(heading) * Math.sin(angularDistance) * Math.cos(latitude),
    Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(projectedLatitude)
  );

  return {
    latitude: projectedLatitude * 180 / Math.PI,
    longitude: ((projectedLongitude * 180 / Math.PI + 540) % 360) - 180
  };
};

export const mapBearingToWindow = (
  bearing: number,
  centerBearing: number,
  viewAngle: number
): WindowBearingPosition => {
  const safeViewAngle = Math.min(180, Math.max(10, viewAngle));
  const delta = getSignedBearingDelta(bearing, centerBearing);
  const rawPercent = ((delta + safeViewAngle / 2) / safeViewAngle) * 100;
  const visible = rawPercent >= 0 && rawPercent <= 100;

  return {
    bearing: normalizeBearing(bearing),
    percent: Math.min(100, Math.max(0, rawPercent)),
    visible,
    edge: visible ? null : rawPercent < 0 ? 'left' : 'right'
  };
};
