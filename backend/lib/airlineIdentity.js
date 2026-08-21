const registry = require('../../src/data/airlineRegistry.json');

const recordsByKey = new Map();
const recordsByIata = new Map();
const recordsByIcao = new Map();

for (const record of registry) {
  recordsByKey.set(record.key, record);
  if (record.iata && !recordsByIata.has(record.iata)) recordsByIata.set(record.iata, record);
  for (const icao of record.icao || []) recordsByIcao.set(icao, record);
}

for (const record of registry) {
  for (const iata of record.iataAliases || []) recordsByIata.set(iata, record);
}

function normalizeIdentifier(value) {
  return String(value || '').trim().toUpperCase();
}

function extractOperatorIcao(value) {
  const normalized = normalizeIdentifier(value);
  if (/^[A-Z]{3}$/.test(normalized)) return normalized;
  const match = normalized.match(/^([A-Z]{3})(?=[A-Z0-9])/);
  return match ? match[1] : '';
}

function extractMarketingIata(value) {
  const normalized = normalizeIdentifier(value);
  if (/^N\d{1,5}[A-Z]{0,2}$/.test(normalized)) return '';
  if (/^[A-Z0-9]{2}$/.test(normalized)) return normalized;
  const match = normalized.match(/^([A-Z0-9]{2})(?=\d)/);
  return match ? match[1] : '';
}

function firstExtracted(extractor, values) {
  for (const value of values) {
    const extracted = extractor(value);
    if (extracted) return extracted;
  }
  return '';
}

function makeIdentity(record, { operatorIcao = '', marketingIata = '', source }) {
  return {
    displayCode: record.key,
    name: record.name,
    iata: marketingIata || record.iata || '',
    icao: operatorIcao || record.icao?.[0] || '',
    resolutionSource: source
  };
}

function resolveAirlineIdentity({
  operatorIcao,
  marketingIata,
  flightNumber,
  callsign,
  airline
} = {}) {
  const structuredAirline = airline && typeof airline === 'object' ? airline : {};
  const legacyAirline = typeof airline === 'string' ? airline : '';

  const providedDisplayCode = normalizeIdentifier(structuredAirline.displayCode);
  const providedDisplayRecord = recordsByKey.get(providedDisplayCode);
  const resolvedOperatorIcao = firstExtracted(extractOperatorIcao, [
    operatorIcao,
    structuredAirline.operatorIcao,
    structuredAirline.icao,
    legacyAirline,
    callsign
  ]);
  const resolvedMarketingIata = firstExtracted(extractMarketingIata, [
    marketingIata,
    structuredAirline.marketingIata,
    structuredAirline.iata,
    flightNumber
  ]);

  if (providedDisplayRecord) {
    return makeIdentity(providedDisplayRecord, {
      operatorIcao: resolvedOperatorIcao,
      marketingIata: resolvedMarketingIata,
      source: 'provided-display-code'
    });
  }

  const operatorRecord = recordsByIcao.get(resolvedOperatorIcao);
  const marketingRecord = recordsByIata.get(resolvedMarketingIata);

  if (operatorRecord?.preferOperatorBrand) {
    return makeIdentity(operatorRecord, {
      operatorIcao: resolvedOperatorIcao,
      marketingIata: resolvedMarketingIata,
      source: 'operator-brand-override'
    });
  }

  if (marketingRecord) {
    return makeIdentity(marketingRecord, {
      operatorIcao: resolvedOperatorIcao,
      marketingIata: resolvedMarketingIata,
      source: 'marketing-flight-number'
    });
  }

  if (operatorRecord) {
    return makeIdentity(operatorRecord, {
      operatorIcao: resolvedOperatorIcao,
      marketingIata: resolvedMarketingIata,
      source: 'operator-icao'
    });
  }

  return {
    displayCode: '',
    name: 'Unknown Airline',
    iata: resolvedMarketingIata,
    icao: resolvedOperatorIcao,
    resolutionSource: 'unknown'
  };
}

module.exports = {
  extractMarketingIata,
  extractOperatorIcao,
  resolveAirlineIdentity
};
