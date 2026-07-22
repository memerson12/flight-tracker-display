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
