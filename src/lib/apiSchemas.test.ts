import { describe, expect, it } from 'vitest';

import { flightResponseSchema } from './apiSchemas';

const validFlight = {
  id: 'flight-1',
  flightNumber: 'TA1',
  callsign: 'TEST1',
  airline: { name: 'Test Air', iata: 'TA', icao: 'TST' },
  aircraft: { type: '', icao: '', registration: '' },
  departure: { airport: '', iata: '', city: '', country: '' },
  arrival: { airport: '', iata: '', city: '', country: '' },
  position: {
    altitude: null,
    speed: null,
    heading: null,
    verticalSpeed: null,
    latitude: 37,
    longitude: -122
  },
  status: 'cruising'
};

describe('flight API schema', () => {
  it('accepts explicit unknown telemetry', () => {
    expect(flightResponseSchema.parse({ flights: [validFlight] }).flights).toHaveLength(1);
  });

  it('rejects malformed coordinates before they reach the display', () => {
    expect(() => flightResponseSchema.parse({
      flights: [{ ...validFlight, position: { ...validFlight.position, latitude: 120 } }]
    })).toThrow();
  });
});
