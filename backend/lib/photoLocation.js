const exifr = require('exifr');

const isValidLatitude = (value) => Number.isFinite(value) && value >= -90 && value <= 90;
const isValidLongitude = (value) => Number.isFinite(value) && value >= -180 && value <= 180;

async function readEmbeddedLocation(filePath, gpsReader = exifr.gps) {
  try {
    const gps = await gpsReader(filePath);
    const latitude = Number(gps?.latitude);
    const longitude = Number(gps?.longitude);

    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;
    return { latitude, longitude };
  } catch (error) {
    console.warn('Unable to read photo GPS metadata:', error.message);
    return null;
  }
}

async function reverseGeocodeLocation(
  latitude,
  longitude,
  {
    accessToken = process.env.MAPBOX_TOKEN || process.env.VITE_MAPBOX_TOKEN,
    fetchImpl = global.fetch
  } = {}
) {
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude) || !accessToken || !fetchImpl) {
    return null;
  }

  const params = new URLSearchParams({
    access_token: accessToken,
    limit: '1',
    types: 'place,locality,region,country'
  });
  const coordinates = `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${coordinates}.json?${params.toString()}`;

  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Mapbox returned ${response.status}`);
    const payload = await response.json();
    const feature = payload.features?.[0];
    return typeof feature?.place_name === 'string' ? feature.place_name : null;
  } catch (error) {
    console.warn('Unable to resolve photo location:', error.message);
    return null;
  }
}

async function resolvePhotoLocation(filePath, options = {}) {
  const coordinates = await readEmbeddedLocation(filePath, options.gpsReader);
  if (!coordinates) return null;

  const location = await reverseGeocodeLocation(
    coordinates.latitude,
    coordinates.longitude,
    options
  );

  return { ...coordinates, location };
}

module.exports = {
  readEmbeddedLocation,
  reverseGeocodeLocation,
  resolvePhotoLocation
};
