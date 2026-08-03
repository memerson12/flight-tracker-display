const normalizeBearing = (bearing) => ((bearing % 360) + 360) % 360;

const calculateBearing = (observer, target) => {
  const toRadians = (degrees) => degrees * Math.PI / 180;
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

const withObserverBearings = (payload, windowPosition = {}) => {
  const observer = {
    latitude: Number(windowPosition.latitude),
    longitude: Number(windowPosition.longitude)
  };
  if (
    !windowPosition.enabled
    || !Number.isFinite(observer.latitude)
    || !Number.isFinite(observer.longitude)
  ) {
    return payload;
  }

  return {
    ...payload,
    flights: (payload.flights || []).map((flight) => {
      const target = {
        latitude: Number(flight.position?.latitude),
        longitude: Number(flight.position?.longitude)
      };
      if (!Number.isFinite(target.latitude) || !Number.isFinite(target.longitude)) return flight;
      return {
        ...flight,
        position: {
          ...flight.position,
          observerBearing: calculateBearing(observer, target)
        }
      };
    })
  };
};

module.exports = { calculateBearing, normalizeBearing, withObserverBearings };
