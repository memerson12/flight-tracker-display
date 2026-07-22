import { Flight } from '@/types/flight';

/**
 * Refresh flight details without allowing provider result ordering to reshuffle
 * the display on every poll. Existing flights keep their current order and new
 * flights are appended.
 */
export const mergeFlightSnapshots = (previous: Flight[], live: Flight[]): Flight[] => {
  const liveById = new Map(live.map((flight) => [flight.id, flight]));
  const retained = previous
    .filter((flight) => liveById.has(flight.id))
    .map((flight) => liveById.get(flight.id) as Flight);
  const retainedIds = new Set(retained.map((flight) => flight.id));
  const additions = live.filter((flight) => !retainedIds.has(flight.id));

  return [...retained, ...additions];
};

export const getNextFlightId = (flightIds: string[], currentId: string | null): string | null => {
  if (flightIds.length === 0) return null;

  const currentIndex = currentId ? flightIds.indexOf(currentId) : -1;
  return flightIds[(currentIndex + 1) % flightIds.length];
};

export const getRemainingLingerMs = (
  emptySince: number,
  now: number,
  lingerMs: number
): number => Math.max(0, lingerMs - (now - emptySince));
