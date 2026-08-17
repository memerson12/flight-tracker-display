const assert = require('assert');

const FlightRadar24Adapter = require('../adapters/FlightRadar24Adapter');
const OpenSkyAdapter = require('../adapters/OpenSkyAdapter');
const {
  extractMarketingIata,
  extractOperatorIcao,
  resolveAirlineIdentity
} = require('../lib/airlineIdentity');
const { normalizeFlight } = require('../lib/flightNormalizer');

describe('airline identity resolution', function() {
  it('separates Southwest marketing and operating codes', function() {
    assert.strictEqual(extractMarketingIata('WN3617'), 'WN');
    assert.strictEqual(extractOperatorIcao('SWA3617'), 'SWA');
    assert.deepStrictEqual(resolveAirlineIdentity({
      marketingIata: 'WN',
      operatorIcao: 'SWA',
      flightNumber: 'WN3617',
      callsign: 'SWA3617'
    }), {
      displayCode: 'WN',
      name: 'Southwest Airlines',
      iata: 'WN',
      icao: 'SWA',
      resolutionSource: 'marketing-flight-number'
    });
  });

  it('resolves Delta without truncating DAL to DA', function() {
    const identity = resolveAirlineIdentity({ flightNumber: 'DL829', callsign: 'DAL829' });
    assert.strictEqual(identity.displayCode, 'DL');
    assert.strictEqual(identity.name, 'Delta Air Lines');
    assert.strictEqual(identity.iata, 'DL');
    assert.strictEqual(identity.icao, 'DAL');
  });

  it('recovers from the legacy payload that duplicated ICAO into the IATA field', function() {
    const identity = resolveAirlineIdentity({
      airline: { name: 'SWA', iata: 'SWA', icao: 'SWA' },
      flightNumber: 'WN3617',
      callsign: 'SWA3617'
    });
    assert.strictEqual(identity.displayCode, 'WN');
    assert.strictEqual(identity.iata, 'WN');
    assert.strictEqual(identity.icao, 'SWA');
  });

  it('uses a marketing carrier for a regional codeshare', function() {
    const identity = resolveAirlineIdentity({ flightNumber: 'DL3857', callsign: 'SKW3857' });
    assert.strictEqual(identity.displayCode, 'DL');
    assert.strictEqual(identity.name, 'Delta Air Lines');
    assert.strictEqual(identity.iata, 'DL');
    assert.strictEqual(identity.icao, 'SKW');
  });

  it('preserves the QantasLink operating brand override', function() {
    for (const operatorIcao of ['QLK', 'QJE', 'NWK']) {
      const identity = resolveAirlineIdentity({
        operatorIcao,
        flightNumber: 'QF829',
        callsign: `${operatorIcao}829D`
      });
      assert.strictEqual(identity.displayCode, 'QLK');
      assert.strictEqual(identity.name, 'QantasLink');
      assert.strictEqual(identity.icao, operatorIcao);
      assert.strictEqual(identity.resolutionSource, 'operator-brand-override');
    }
  });

  it('does not manufacture an airline from an unknown ICAO prefix or registration', function() {
    assert.deepStrictEqual(resolveAirlineIdentity({ callsign: 'XYZ123' }), {
      displayCode: '',
      name: 'Unknown Airline',
      iata: '',
      icao: 'XYZ',
      resolutionSource: 'unknown'
    });
    assert.deepStrictEqual(resolveAirlineIdentity({ flightNumber: 'N9744T', callsign: 'N9744T' }), {
      displayCode: '',
      name: 'Unknown Airline',
      iata: '',
      icao: '',
      resolutionSource: 'unknown'
    });
  });

  it('avoids ICAO/IATA prefix collisions', function() {
    assert.strictEqual(resolveAirlineIdentity({ callsign: 'UAE123' }).displayCode, 'EK');
    assert.strictEqual(resolveAirlineIdentity({ callsign: 'DLH456' }).displayCode, 'LH');
    assert.strictEqual(resolveAirlineIdentity({ callsign: 'QTR789' }).displayCode, 'QR');
  });

  it('maps every airline operating Brisbane departures on 17-18 August 2026', function() {
    const brisbaneAirlines = [
      ['AL', 'Aerlink'],
      ['AC', 'Air Canada'],
      ['NZ', 'Air New Zealand'],
      ['PX', 'Air Niugini'],
      ['QQ', 'Alliance Airlines'],
      ['OD', 'Batik Air Malaysia'],
      ['CX', 'Cathay Pacific'],
      ['CI', 'China Airlines'],
      ['MU', 'China Eastern Airlines'],
      ['CZ', 'China Southern Airlines'],
      ['BR', 'EVA Air'],
      ['EK', 'Emirates'],
      ['FJ', 'Fiji Airways'],
      ['JQ', 'Jetstar Airways'],
      ['KE', 'Korean Air'],
      ['FC', 'Link Airways'],
      ['MH', 'Malaysia Airlines'],
      ['NC', 'National Jet Express'],
      ['ON', 'Nauru Airlines'],
      ['GD', 'Nexus Airlines'],
      ['PR', 'Philippine Airlines'],
      ['QF', 'Qantas'],
      ['QR', 'Qatar Airways'],
      ['ZL', 'Rex Airlines'],
      ['SQ', 'Singapore Airlines'],
      ['IE', 'Solomon Airlines'],
      ['UA', 'United Airlines'],
      ['VJ', 'VietJet Air'],
      ['VA', 'Virgin Australia']
    ];

    for (const [iata, name] of brisbaneAirlines) {
      const identity = resolveAirlineIdentity({ flightNumber: `${iata}123` });
      assert.strictEqual(identity.displayCode, iata);
      assert.strictEqual(identity.name, name);
      assert.strictEqual(identity.iata, iata);
      assert.strictEqual(identity.resolutionSource, 'marketing-flight-number');
    }
  });

  it('maps the new Brisbane operators from their ICAO callsigns', function() {
    const operatorCodes = [
      ['ANG', 'PX'],
      ['MXD', 'OD'],
      ['CAL', 'CI'],
      ['CES', 'MU'],
      ['EVA', 'BR'],
      ['FJI', 'FJ'],
      ['FCA', 'FC'],
      ['JTE', 'NC'],
      ['RON', 'ON'],
      ['PAL', 'PR'],
      ['RXA', 'ZL'],
      ['SOL', 'IE'],
      ['VJC', 'VJ']
    ];

    for (const [icao, displayCode] of operatorCodes) {
      assert.strictEqual(
        resolveAirlineIdentity({ callsign: `${icao}123` }).displayCode,
        displayCode
      );
    }
  });
});

describe('provider airline parsing', function() {
  it('keeps FlightRadar24 marketing and operating codes separate', function() {
    const adapter = new FlightRadar24Adapter();
    const raw = adapter.parseFR24Flight('flight-id', [
      'abc123', 37.5, -122.4, 90, 10000, 250, '', '', 'B738', 'N123WN',
      0, 'KSFO', 'KLAX', 'WN3617', 0, 0, 'SWA3617'
    ]);

    assert.strictEqual(raw.flightNumber, 'WN3617');
    assert.strictEqual(raw.callsign, 'SWA3617');
    assert.strictEqual(raw.marketingIata, 'WN');
    assert.strictEqual(raw.operatorIcao, 'SWA');
  });

  it('does not invent a marketing flight number for OpenSky state vectors', function() {
    const adapter = new OpenSkyAdapter();
    const raw = adapter.parseOpenSkyFlight([
      'abc123', 'DAL829 ', 'United States', 0, 0, -122.4, 37.5, 3000,
      false, 150, 90, 0, null, 3000, '', false, 0
    ]);

    assert.strictEqual(raw.callsign, 'DAL829');
    assert.strictEqual(raw.flightNumber, '');
    assert.strictEqual(raw.operatorIcao, 'DAL');
    assert.strictEqual(raw.marketingIata, '');
  });
});

describe('normalized flight airline contract', function() {
  it('returns one canonical display brand while retaining both source codes', function() {
    const flight = normalizeFlight({
      id: 'regional-flight',
      icao24: 'abc123',
      flightNumber: 'DL3857',
      callsign: 'SKW3857',
      marketingIata: 'DL',
      operatorIcao: 'SKW',
      latitude: 37.5,
      longitude: -122.4,
      altitude: 3000,
      velocity: 150,
      heading: 90,
      verticalRate: 0
    });

    assert.deepStrictEqual(flight.airline, {
      displayCode: 'DL',
      name: 'Delta Air Lines',
      iata: 'DL',
      icao: 'SKW',
      resolutionSource: 'marketing-flight-number'
    });
  });

  it('classifies an unknown operator with a business-jet type', function() {
    const flight = normalizeFlight({
      id: 'business-jet',
      icao24: 'abc124',
      callsign: 'N123AB',
      aircraft: 'GLF6',
      registration: 'N123AB',
      latitude: 37.5,
      longitude: -122.4
    });

    assert.strictEqual(flight.airline.resolutionSource, 'unknown');
    assert.strictEqual(flight.aircraft.identity.category, 'business-jet');
    assert.strictEqual(flight.aircraft.identity.label, 'Business Jet');
    assert.strictEqual(flight.aircraft.identity.registration, 'N123AB');
  });
});

describe('normalized flight telemetry contract', function() {
  it('preserves missing telemetry as unknown instead of manufacturing zeroes', function() {
    const flight = normalizeFlight({
      id: 'missing-telemetry',
      latitude: 1,
      longitude: 1
    });

    assert.strictEqual(flight.position.altitude, null);
    assert.strictEqual(flight.position.speed, null);
    assert.strictEqual(flight.position.verticalSpeed, null);
    assert.strictEqual(flight.position.heading, null);
  });
});
