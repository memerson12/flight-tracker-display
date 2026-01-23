const FEET_PER_METER = 3.28084;
const KNOTS_PER_MPS = 1.94384;
const FPM_PER_MPS = 196.8504;

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function metersToFeet(value) {
  return Math.round(toNumber(value) * FEET_PER_METER);
}

function mpsToKnots(value) {
  return Math.round(toNumber(value) * KNOTS_PER_MPS);
}

function mpsToFpm(value) {
  return Math.round(toNumber(value) * FPM_PER_MPS);
}

function normalizeAirline(code) {
  const trimmed = String(code || '').trim();
  if (!trimmed) {
    return { name: 'Unknown Airline', iata: '', icao: '' };
  }

  return {
    name: trimmed,
    iata: trimmed,
    icao: trimmed
  };
}

function normalizeAirport(code) {
  const trimmed = String(code || '').trim();
  return {
    airport: trimmed || 'Unknown Airport',
    iata: trimmed,
    city: '',
    country: ''
  };
}

function resolveStatus({ onGround, verticalSpeed, altitude }) {
  if (onGround) return 'landed';

  const vs = toNumber(verticalSpeed, 0);
  const alt = toNumber(altitude, 0);

  if (alt < 3000 && vs < -200) return 'approaching';
  if (vs > 300) return 'climbing';
  if (vs < -300) return 'descending';
  return 'cruising';
}

function normalizeFlight(rawFlight) {
  if (!rawFlight) return null;

  const latitude = toNumber(rawFlight.latitude, null);
  const longitude = toNumber(rawFlight.longitude, null);
  if (latitude === null || longitude === null) return null;

  const altitudeFeet = metersToFeet(rawFlight.altitude);
  const speedKnots = mpsToKnots(rawFlight.velocity);
  const verticalFpm = mpsToFpm(rawFlight.verticalRate);
  const heading = Math.round(toNumber(rawFlight.heading, 0));

  const airline = normalizeAirline(rawFlight.airline);
  const departure = normalizeAirport(rawFlight.origin);
  const arrival = normalizeAirport(rawFlight.destination);

  return {
    id: rawFlight.id || `${rawFlight.icao24 || 'unknown'}_${rawFlight.callsign || 'unknown'}`,
    flightNumber: String(rawFlight.flightNumber || rawFlight.callsign || '').trim(),
    callsign: String(rawFlight.callsign || '').trim(),
    airline,
    aircraft: {
      type: String(rawFlight.aircraft || '').trim(),
      icao: String(rawFlight.aircraft || '').trim(),
      registration: String(rawFlight.registration || '').trim()
    },
    departure,
    arrival,
    position: {
      altitude: altitudeFeet,
      speed: speedKnots,
      heading,
      verticalSpeed: verticalFpm,
      latitude,
      longitude
    },
    status: resolveStatus({
      onGround: rawFlight.onGround,
      verticalSpeed: verticalFpm,
      altitude: altitudeFeet
    })
  };
}

function normalizeFlightData(data) {
  const flights = Array.isArray(data?.flights) ? data.flights : [];
  const normalized = flights.map(normalizeFlight).filter(Boolean);

  return {
    flights: normalized,
    source: data?.source || 'unknown',
    timestamp: data?.timestamp || Date.now(),
    center: data?.center || null,
    radius: data?.radius || null,
    location: data?.location || null
  };
}

module.exports = {
  normalizeFlightData
};
