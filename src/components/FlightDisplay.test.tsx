import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import FlightDisplay from './FlightDisplay';

const flight = {
  id: 'flight-1',
  flightNumber: 'TA1',
  callsign: 'TEST1',
  airline: { name: 'Test Air', iata: 'TA', icao: 'TST' },
  aircraft: { type: '', icao: '', registration: '' },
  departure: { airport: '', iata: '', city: '', country: '' },
  arrival: { airport: '', iata: '', city: '', country: '' },
  position: {
    altitude: 10000,
    speed: 400,
    heading: 90,
    verticalSpeed: 0,
    latitude: 37,
    longitude: -122
  },
  status: 'cruising'
};

const jsonResponse = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' }
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FlightDisplay bootstrap', () => {
  it('shows the first successful live flight without waiting for slideshow dwell', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request) => {
      const path = String(url);
      if (path.includes('/api/flights/overhead')) {
        return jsonResponse({ flights: [flight], source: 'test', timestamp: Date.now() });
      }
      if (path.includes('/api/photos')) return jsonResponse([]);
      if (path.includes('/api/settings')) return jsonResponse({});
      return Promise.resolve(new Response(null, { status: 404 }));
    }));

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchInterval: false } }
    });

    render(
      <QueryClientProvider client={client}>
        <FlightDisplay />
      </QueryClientProvider>
    );

    expect(await screen.findByText('CRUISING')).toBeInTheDocument();
    expect(screen.getByText('10,000')).toBeInTheDocument();
    client.clear();
  });
});
