import { describe, expect, it } from 'vitest';

import { Flight } from '@/types/flight';
import {
  getNextFlightId,
  getRemainingLingerMs,
  mergeFlightSnapshots
} from './flightDisplayState';

const flight = (id: string, altitude: number): Flight => ({
  id,
  flightNumber: id,
  callsign: id,
  airline: { name: 'Test Air', iata: 'TA', icao: 'TST', country: 'US' },
  aircraft: { type: 'Test', icao: 'TEST', registration: id },
  departure: { iata: 'AAA', icao: 'AAAA', city: 'Alpha', country: 'US' },
  arrival: { iata: 'BBB', icao: 'BBBB', city: 'Bravo', country: 'US' },
  position: {
    altitude,
    speed: 400,
    heading: 90,
    verticalSpeed: 0,
    latitude: 0,
    longitude: 0
  },
  status: 'cruising'
});

describe('mergeFlightSnapshots', () => {
  it('keeps the displayed order while refreshing flight details', () => {
    const merged = mergeFlightSnapshots(
      [flight('A', 10_000), flight('B', 20_000)],
      [flight('B', 21_000), flight('A', 11_000)]
    );

    expect(merged.map(({ id }) => id)).toEqual(['A', 'B']);
    expect(merged.map(({ position }) => position.altitude)).toEqual([11_000, 21_000]);
  });

  it('removes departed flights and appends newly detected flights', () => {
    const merged = mergeFlightSnapshots(
      [flight('A', 10_000), flight('B', 20_000)],
      [flight('B', 21_000), flight('C', 30_000)]
    );

    expect(merged.map(({ id }) => id)).toEqual(['B', 'C']);
  });
});

describe('getNextFlightId', () => {
  it('rotates by stable ID and wraps to the first flight', () => {
    expect(getNextFlightId(['A', 'B', 'C'], 'A')).toBe('B');
    expect(getNextFlightId(['A', 'B', 'C'], 'C')).toBe('A');
  });

  it('selects the first flight when the current ID disappeared', () => {
    expect(getNextFlightId(['A', 'B'], 'missing')).toBe('A');
  });
});

describe('getRemainingLingerMs', () => {
  it('continues one grace period across repeated empty polls', () => {
    expect(getRemainingLingerMs(1_000, 11_000, 45_000)).toBe(35_000);
    expect(getRemainingLingerMs(1_000, 31_000, 45_000)).toBe(15_000);
    expect(getRemainingLingerMs(1_000, 46_000, 45_000)).toBe(0);
  });
});
