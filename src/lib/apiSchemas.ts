import { z } from 'zod';

const airportSchema = z.object({
  airport: z.string(),
  iata: z.string(),
  city: z.string(),
  country: z.string(),
  time: z.string().optional()
});

export const flightSchema = z.object({
  id: z.string().min(1),
  flightNumber: z.string(),
  callsign: z.string(),
  airline: z.object({
    displayCode: z.string().optional(),
    name: z.string(),
    iata: z.string(),
    icao: z.string(),
    resolutionSource: z.string().optional(),
    logo: z.string().optional()
  }),
  aircraft: z.object({
    type: z.string(),
    icao: z.string(),
    registration: z.string(),
    identity: z.object({
      category: z.literal('business-jet'),
      label: z.string(),
      brandCode: z.string().optional(),
      registration: z.string(),
      manufacturer: z.string().optional(),
      model: z.string().optional(),
      registeredName: z.string().optional(),
      relationship: z.enum(['registered-owner', 'registered-operator', 'registered-holder', '']).optional(),
      registry: z.enum(['FAA', 'CASA', '']).optional()
    }).optional()
  }),
  departure: airportSchema,
  arrival: airportSchema,
  position: z.object({
    altitude: z.number().finite().nullable(),
    speed: z.number().finite().nullable(),
    heading: z.number().finite().nullable(),
    verticalSpeed: z.number().finite().nullable(),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    observedAt: z.number().finite().positive().optional(),
    observerBearing: z.number().finite().optional()
  }),
  status: z.enum(['climbing', 'descending', 'cruising', 'approaching', 'landed'])
});

export const flightResponseSchema = z.object({
  flights: z.array(flightSchema),
  source: z.string().optional(),
  timestamp: z.number().finite().positive().optional()
});
