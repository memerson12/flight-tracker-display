import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Flight } from '@/types/flight';

import FlightCard from './FlightCard';

const flight: Flight = {
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

describe('FlightCard', () => {
  it('labels the actual flight state and does not manufacture zero telemetry', () => {
    render(<FlightCard flight={flight} />);

    expect(screen.getByText('CRUISING')).toBeInTheDocument();
    expect(screen.queryByText('OVERHEAD NOW')).not.toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(4);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
