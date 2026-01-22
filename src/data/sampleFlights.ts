import { Flight } from '@/types/flight';

export const sampleFlights: Flight[] = [
  {
    id: '1',
    flightNumber: 'BA289',
    callsign: 'SPEEDBIRD289',
    airline: {
      name: 'British Airways',
      iata: 'BA',
      icao: 'BAW',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/British_Airways_Logo.svg/200px-British_Airways_Logo.svg.png',
    },
    aircraft: {
      type: 'Boeing 777-300ER',
      icao: 'B77W',
      registration: 'G-STBH',
    },
    departure: {
      airport: 'Los Angeles International',
      iata: 'LAX',
      city: 'Los Angeles',
      country: 'USA',
      time: '15:30',
    },
    arrival: {
      airport: 'London Heathrow',
      iata: 'LHR',
      city: 'London',
      country: 'UK',
      time: '09:45',
    },
    position: {
      altitude: 3500,
      speed: 165,
      heading: 270,
      verticalSpeed: -1200,
      latitude: 51.4700,
      longitude: -0.4543,
    },
    status: 'approaching',
  },
  {
    id: '2',
    flightNumber: 'EK29',
    callsign: 'EMIRATES29',
    airline: {
      name: 'Emirates',
      iata: 'EK',
      icao: 'UAE',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/Emirates_logo.svg/200px-Emirates_logo.svg.png',
    },
    aircraft: {
      type: 'Airbus A380-800',
      icao: 'A388',
      registration: 'A6-EUV',
    },
    departure: {
      airport: 'Dubai International',
      iata: 'DXB',
      city: 'Dubai',
      country: 'UAE',
      time: '02:35',
    },
    arrival: {
      airport: 'London Heathrow',
      iata: 'LHR',
      city: 'London',
      country: 'UK',
      time: '07:10',
    },
    position: {
      altitude: 4200,
      speed: 158,
      heading: 265,
      verticalSpeed: -1000,
      latitude: 51.4680,
      longitude: -0.4200,
    },
    status: 'approaching',
  },
  {
    id: '3',
    flightNumber: 'VS4',
    callsign: 'VIRGIN4',
    airline: {
      name: 'Virgin Atlantic',
      iata: 'VS',
      icao: 'VIR',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Virgin_Atlantic_logo.svg/200px-Virgin_Atlantic_logo.svg.png',
    },
    aircraft: {
      type: 'Airbus A350-1000',
      icao: 'A35K',
      registration: 'G-VLIB',
    },
    departure: {
      airport: 'John F. Kennedy',
      iata: 'JFK',
      city: 'New York',
      country: 'USA',
      time: '22:00',
    },
    arrival: {
      airport: 'London Heathrow',
      iata: 'LHR',
      city: 'London',
      country: 'UK',
      time: '10:15',
    },
    position: {
      altitude: 2800,
      speed: 145,
      heading: 275,
      verticalSpeed: -1400,
      latitude: 51.4720,
      longitude: -0.4800,
    },
    status: 'approaching',
  },
];

export const samplePhotos = [
  {
    id: '1',
    src: 'https://images.unsplash.com/photo-1609220136736-443140cffec6?w=2560&q=80',
    caption: 'Family gathering',
  },
  {
    id: '2',
    src: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=2560&q=80',
    caption: 'Summer memories',
  },
  {
    id: '3',
    src: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=2560&q=80',
    caption: 'Together',
  },
  {
    id: '4',
    src: 'https://images.unsplash.com/photo-1516733725897-1aa73b87c8e8?w=2560&q=80',
    caption: 'Celebrations',
  },
];
