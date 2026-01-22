export interface Flight {
  id: string;
  flightNumber: string;
  callsign: string;
  airline: {
    name: string;
    iata: string;
    icao: string;
    logo?: string;
  };
  aircraft: {
    type: string;
    icao: string;
    registration: string;
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
    altitude: number; // feet
    speed: number; // knots
    heading: number; // degrees
    verticalSpeed: number; // feet per minute
    latitude: number;
    longitude: number;
  };
  status: 'climbing' | 'descending' | 'cruising' | 'approaching' | 'landed';
}

export interface Photo {
  id: string;
  src: string;
  caption?: string;
}
