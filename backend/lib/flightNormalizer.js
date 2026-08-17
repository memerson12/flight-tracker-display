const FEET_PER_METER = 3.28084;
const KNOTS_PER_MPS = 1.94384;
const FPM_PER_MPS = 196.8504;
const { resolveAircraftIdentity } = require('./aircraftClassification');
const { lookupAircraftRegistration } = require('./aircraftRegistry');
const { resolveAirlineIdentity } = require('./airlineIdentity');
const unknownAirlineWarnings = new Set();

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function metersToFeet(value) {
  const number = toNumber(value, null);
  return number === null ? null : Math.round(number * FEET_PER_METER);
}

function mpsToKnots(value) {
  const number = toNumber(value, null);
  return number === null ? null : Math.round(number * KNOTS_PER_MPS);
}

function mpsToFpm(value) {
  const number = toNumber(value, null);
  return number === null ? null : Math.round(number * FPM_PER_MPS);
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

  const vs = toNumber(verticalSpeed, null);
  const alt = toNumber(altitude, null);

  if (alt !== null && vs !== null && alt < 3000 && vs < -200) return 'approaching';
  if (vs !== null && vs > 300) return 'climbing';
  if (vs !== null && vs < -300) return 'descending';
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
  const rawHeading = toNumber(rawFlight.heading, null);
  const heading = rawHeading === null ? null : Math.round(rawHeading);

  const airline = resolveAirlineIdentity({
    operatorIcao: rawFlight.operatorIcao,
    marketingIata: rawFlight.marketingIata,
    flightNumber: rawFlight.flightNumber,
    callsign: rawFlight.callsign,
    airline: rawFlight.airline
  });
  if (airline.resolutionSource === 'unknown' && (airline.icao || airline.iata)) {
    const signature = `${airline.icao}|${airline.iata}`;
    if (!unknownAirlineWarnings.has(signature)) {
      if (unknownAirlineWarnings.size >= 100) unknownAirlineWarnings.clear();
      unknownAirlineWarnings.add(signature);
      console.warn('Unresolved airline identity', {
        operatorIcao: airline.icao,
        marketingIata: airline.iata,
        flightNumber: rawFlight.flightNumber || '',
        callsign: rawFlight.callsign || ''
      });
    }
  }
  const departure = normalizeAirport(rawFlight.origin);
  const arrival = normalizeAirport(rawFlight.destination);
  const registryRecord = airline.resolutionSource === 'unknown'
    ? lookupAircraftRegistration({
        registration: rawFlight.registration,
        modeS: rawFlight.icao24
      })
    : null;
  const aircraftIdentity = airline.resolutionSource === 'unknown'
    ? resolveAircraftIdentity({
        aircraftType: rawFlight.aircraft,
        registration: rawFlight.registration,
        registryRecord
      })
    : null;
  const registration = String(
    aircraftIdentity?.registration || registryRecord?.registration || rawFlight.registration || ''
  ).trim();

  return {
    id: rawFlight.id || `${rawFlight.icao24 || 'unknown'}_${rawFlight.callsign || 'unknown'}`,
    flightNumber: String(rawFlight.flightNumber || rawFlight.callsign || '').trim(),
    callsign: String(rawFlight.callsign || '').trim(),
    airline,
    aircraft: {
      type: String(rawFlight.aircraft || '').trim(),
      icao: String(rawFlight.aircraft || '').trim(),
      registration,
      ...(aircraftIdentity ? { identity: aircraftIdentity } : {})
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
  normalizeFlight,
  normalizeFlightData
};
