export interface Flight {
  id: string;
  flightNumber: string;
  callsign: string;
  airline: {
    displayCode?: string;
    name: string;
    iata: string;
    icao: string;
    resolutionSource?: string;
    logo?: string;
  };
  aircraft: {
    type: string;
    icao: string;
    registration: string;
    identity?: {
      category: 'business-jet';
      label: string;
      brandCode?: string;
      registration: string;
      manufacturer?: string;
      model?: string;
      registeredName?: string;
      relationship?: 'registered-owner' | 'registered-operator' | 'registered-holder' | '';
      registry?: 'FAA' | 'CASA' | '';
    };
  };
  departure: {
    airport: string;
    iata: string;
    city: string;
    country: string;
    time?: string;
  };
  arrival: {
    airport: string;
    iata: string;
    city: string;
    country: string;
    time?: string;
  };
  position: {
    altitude: number | null; // feet
    speed: number | null; // knots
    heading: number | null; // degrees
    verticalSpeed: number | null; // feet per minute
    latitude: number;
    longitude: number;
    observedAt?: number;
    observerBearing?: number;
  };
  status: 'climbing' | 'descending' | 'cruising' | 'approaching' | 'landed';
}

export interface Photo {
  id: string;
  src: string;
  location?: string;
}
