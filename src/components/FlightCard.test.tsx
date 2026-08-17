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

  it('replaces an unknown airline with a registry-enriched business jet identity', () => {
    render(<FlightCard flight={{
      ...flight,
      flightNumber: '',
      callsign: 'N123AB',
      airline: { name: 'Unknown Airline', iata: '', icao: '', resolutionSource: 'unknown' },
      aircraft: {
        type: 'GLF6',
        icao: 'GLF6',
        registration: 'N123AB',
        identity: {
          category: 'business-jet',
          label: 'Business Jet',
          registration: 'N123AB',
          manufacturer: 'Gulfstream',
          model: 'G650',
          registeredName: 'EXAMPLE AVIATION LLC',
          relationship: 'registered-owner',
          registry: 'FAA'
        }
      }
    }} />);

    expect(screen.getByRole('heading', { name: 'Business Jet' })).toBeInTheDocument();
    expect(screen.getByText('Registered to EXAMPLE AVIATION LLC')).toBeInTheDocument();
    expect(screen.queryByText('Unknown Airline')).not.toBeInTheDocument();
  });

  it('labels a completely unidentified flight as unknown aircraft', () => {
    render(<FlightCard flight={{
      ...flight,
      flightNumber: '',
      callsign: 'UNKNOWN1',
      airline: { name: 'Unknown Airline', iata: '', icao: '', resolutionSource: 'unknown' }
    }} />);

    expect(screen.getByRole('heading', { name: 'Unknown Aircraft' })).toBeInTheDocument();
    expect(screen.queryByText('Unknown Airline')).not.toBeInTheDocument();
  });
});
