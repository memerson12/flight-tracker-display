import { useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Gauge, Minus, Mountain, Plane } from 'lucide-react';

import { getAircraftName, getAirline, getLogoUrl, resolveFlightAirlineCode } from '@/lib/airlines';
import { getDisplayAccent } from '@/lib/displayColor';
import { Flight } from '@/types/flight';

interface FlightCardProps {
  flight: Flight;
  isLingering?: boolean;
}

interface MetricCardProps {
  accent: string;
  icon: ReactNode;
  label: string;
  value: string;
  unit: string;
}

const hasUsefulAirportCode = (code?: string) => (
  Boolean(code && !['---', 'N/A', 'UNK', 'UNKNOWN'].includes(code.trim().toUpperCase()))
);

const getDisplayStatus = (flight: Flight, isLingering: boolean) => {
  if (isLingering) return 'LEAVING AREA';
  if (flight.status === 'landed') return 'ON GROUND';
  if (flight.status === 'approaching') return 'APPROACHING';
  if (flight.status === 'climbing') return 'CLIMBING';
  if (flight.status === 'descending') return 'DESCENDING';
  return 'CRUISING';
};

const formatMetric = (value: number | null) => value === null ? '—' : value.toLocaleString();

const getRegistryAttribution = (flight: Flight) => {
  const identity = flight.aircraft.identity;
  if (!identity?.registeredName) return '';
  const prefix = identity.relationship === 'registered-operator'
    ? 'Operated by'
    : identity.relationship === 'registered-holder'
      ? 'Registered holder'
      : 'Registered to';
  return `${prefix} ${identity.registeredName}`;
};

const MetricCard = ({ accent, icon, label, value, unit }: MetricCardProps) => (
  <div
    className="card-glass rounded-2xl px-5 py-4 text-center"
    style={{ boxShadow: `0 0 30px -10px ${accent}38` }}
  >
    <div className="flex items-center justify-center gap-2 mb-1.5 text-muted-foreground/90">
      {icon}
      <span className="text-[0.82rem] font-medium uppercase tracking-[0.14em]">{label}</span>
    </div>
    <div className="font-mono text-[2.7rem] leading-none font-bold text-foreground tracking-tight">
      {value}
      <span className="text-base font-medium text-muted-foreground ml-1.5 tracking-normal">{unit}</span>
    </div>
  </div>
);

const FlightCard = ({ flight, isLingering = false }: FlightCardProps) => {
  const resolvedAirlineCode = resolveFlightAirlineCode({
    displayCode: flight.airline.displayCode,
    icao: flight.airline.icao,
    iata: flight.airline.iata,
    flightNumber: flight.flightNumber,
    callsign: flight.callsign
  });
  const aircraftIdentity = flight.aircraft.identity;
  const airlineCode = aircraftIdentity?.brandCode || resolvedAirlineCode;
  const airline = getAirline(airlineCode);
  const accent = getDisplayAccent(aircraftIdentity && !aircraftIdentity.brandCode ? '#72A7D8' : airline.color);
  const airlineLogo = getLogoUrl(airlineCode);
  const displayName = aircraftIdentity?.label
    || (airline.name === 'Unknown Airline' ? 'Unknown Aircraft' : airline.name);
  const [logoFailed, setLogoFailed] = useState(false);
  const rawAircraftType = flight.aircraft.icao || flight.aircraft.type;
  const typeName = getAircraftName(rawAircraftType);
  const aircraftName = aircraftIdentity?.model
    && (typeName === 'Unknown Aircraft' || typeName === rawAircraftType)
    ? [aircraftIdentity.manufacturer, aircraftIdentity.model].filter(Boolean).join(' ')
    : typeName;
  const hasDeparture = hasUsefulAirportCode(flight.departure.iata);
  const hasArrival = hasUsefulAirportCode(flight.arrival.iata);
  const hasCompleteRoute = hasDeparture && hasArrival;
  const knownRoutePoint = hasDeparture
    ? [flight.departure.iata, flight.departure.city].filter(Boolean).join(' / ')
    : hasArrival
      ? [flight.arrival.iata, flight.arrival.city].filter(Boolean).join(' / ')
      : null;
  const primaryIdentifier = aircraftIdentity?.registration
    || flight.flightNumber
    || flight.callsign
    || flight.aircraft.registration
    || 'Unknown flight';
  const secondaryIdentifier = aircraftIdentity
    ? [flight.flightNumber, flight.callsign].find((value) => value && value !== primaryIdentifier)
    : flight.callsign && flight.callsign !== flight.flightNumber
      ? flight.callsign
      : flight.aircraft.registration;
  const registryAttribution = getRegistryAttribution(flight);
  const status = getDisplayStatus(flight, isLingering);
  const logoTileStyle = {
    backgroundColor: '#F4F4F5',
    borderColor: `${accent}88`,
    boxShadow: `0 0 54px -18px ${accent}88, 0 0 96px -30px ${accent}55`
  };

  const verticalIcon = flight.position.verticalSpeed !== null && flight.position.verticalSpeed > 100
    ? <ArrowUp className="w-5 h-5 text-aviation-green" />
    : flight.position.verticalSpeed !== null && flight.position.verticalSpeed < -100
      ? <ArrowDown className="w-5 h-5 text-aviation-amber" />
      : <Minus className="w-5 h-5 text-muted-foreground" />;

  return (
    <div
      className="w-full h-full flex flex-col justify-center items-center px-8 py-6"
      style={{ '--airline-color': accent } as CSSProperties}
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <div
          className="flight-ambient-glow"
          style={{ background: `radial-gradient(ellipse at center, ${accent}2b 0%, ${accent}10 44%, transparent 72%)` }}
        />
      </div>

      <div className="relative z-10 w-full max-w-5xl">
        <div className="flex items-center justify-between mb-7">
          <div className="flex items-center gap-5 min-w-0">
            {airlineLogo && !logoFailed ? (
              <div
                className="w-24 h-24 shrink-0 rounded-2xl border flex items-center justify-center p-3.5 overflow-hidden"
                style={logoTileStyle}
              >
                <img
                  src={airlineLogo}
                  alt={displayName}
                  className="max-w-full max-h-full object-contain drop-shadow-sm"
                  onError={() => setLogoFailed(true)}
                />
              </div>
            ) : (
              <div
                className="w-24 h-24 shrink-0 rounded-2xl border flex items-center justify-center"
                style={{ ...logoTileStyle, backgroundColor: `${accent}18` }}
              >
                <Plane className="w-12 h-12" style={{ color: accent }} />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-5xl font-bold text-foreground tracking-tight truncate">
                {displayName}
              </h1>
              <div className="flex items-center gap-3 mt-1.5 min-w-0">
                <span className="font-mono text-2xl font-semibold" style={{ color: accent }}>
                  {primaryIdentifier}
                </span>
                {secondaryIdentifier && (
                  <>
                    <span className="text-muted-foreground text-lg">/</span>
                    <span className="text-muted-foreground text-lg truncate">{secondaryIdentifier}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div
            className="shrink-0 ml-6 px-5 py-2.5 rounded-full border"
            style={{ backgroundColor: `${accent}1c`, borderColor: `${accent}66` }}
          >
            <span className="font-semibold uppercase tracking-[0.12em] text-sm" style={{ color: accent }}>
              {status}
            </span>
          </div>
        </div>

        {hasCompleteRoute ? (
          <div className="card-glass rounded-3xl px-10 py-8 mb-7" style={{ boxShadow: `0 0 60px -14px ${accent}3d` }}>
            <div className="flex items-center justify-between">
              <div className="text-center flex-1 min-w-0">
                <div className="text-8xl leading-none font-bold text-foreground tracking-tighter mb-2">
                  {flight.departure.iata}
                </div>
                <div className="text-xl text-muted-foreground truncate">{flight.departure.city}</div>
                {flight.departure.time && (
                  <div className="font-mono text-base mt-1" style={{ color: `${accent}cc` }}>DEP {flight.departure.time}</div>
                )}
              </div>

              <div className="flex-1 flex flex-col items-center px-8">
                <div className="flex items-center gap-3 w-full justify-center">
                  <div className="h-px flex-1" style={{ background: `linear-gradient(to right, transparent, ${accent})` }} />
                  <Plane className="w-10 h-10 rotate-90" style={{ color: accent }} />
                  <ArrowRight className="w-7 h-7" style={{ color: `${accent}aa` }} />
                  <div className="h-px flex-1" style={{ background: `linear-gradient(to right, ${accent}, transparent)` }} />
                </div>
                <div className="mt-3 font-mono text-sm text-muted-foreground text-center">{aircraftName}</div>
                <div className="font-mono text-xs text-muted-foreground/70">{flight.aircraft.registration}</div>
                {registryAttribution && (
                  <div className="mt-1 max-w-60 truncate text-center text-xs text-muted-foreground/70">
                    {registryAttribution}
                  </div>
                )}
              </div>

              <div className="text-center flex-1 min-w-0">
                <div className="text-8xl leading-none font-bold text-foreground tracking-tighter mb-2">
                  {flight.arrival.iata}
                </div>
                <div className="text-xl text-muted-foreground truncate">{flight.arrival.city}</div>
                {flight.arrival.time && (
                  <div className="font-mono text-base text-aviation-green mt-1">ARR {flight.arrival.time}</div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="card-glass rounded-3xl px-10 py-7 mb-7" style={{ boxShadow: `0 0 60px -14px ${accent}3d` }}>
            <div className="flex items-center justify-between gap-12 min-h-[190px]">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold uppercase tracking-[0.2em] mb-3" style={{ color: accent }}>
                  Aircraft overhead
                </div>
                <div className="font-mono text-7xl leading-none font-bold tracking-tight text-foreground truncate">
                  {primaryIdentifier}
                </div>
                <div className="text-xl text-muted-foreground mt-4">Route information unavailable</div>
                {knownRoutePoint && (
                  <div className="font-mono text-sm text-muted-foreground/70 mt-2">Known route point / {knownRoutePoint}</div>
                )}
              </div>
              <div className="w-[34%] self-stretch border-l border-border/70 pl-10 flex flex-col justify-center">
                <Plane className="w-12 h-12 rotate-90 mb-4" style={{ color: accent }} />
                <div className="text-2xl font-semibold text-foreground leading-tight">{aircraftName}</div>
                <div className="font-mono text-lg text-muted-foreground mt-2">{flight.aircraft.registration || 'Registration unknown'}</div>
                {registryAttribution && (
                  <div className="mt-3 text-sm leading-snug text-muted-foreground/75">
                    {registryAttribution}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-4 gap-4">
          <MetricCard
            accent={accent}
            icon={<Mountain className="w-5 h-5" style={{ color: accent }} />}
            label="Altitude"
            value={formatMetric(flight.position.altitude)}
            unit="ft"
          />
          <MetricCard
            accent={accent}
            icon={<Gauge className="w-5 h-5" style={{ color: accent }} />}
            label="Speed"
            value={formatMetric(flight.position.speed)}
            unit="kts"
          />
          <MetricCard
            accent={accent}
            icon={verticalIcon}
            label="Vertical speed"
            value={flight.position.verticalSpeed === null
              ? '—'
              : `${flight.position.verticalSpeed > 0 ? '+' : ''}${flight.position.verticalSpeed.toLocaleString()}`}
            unit="fpm"
          />
          <MetricCard
            accent={accent}
            icon={<Plane className="w-5 h-5" style={{
              color: accent,
              transform: flight.position.heading === null ? undefined : `rotate(${flight.position.heading}deg)`
            }} />}
            label="Heading"
            value={flight.position.heading === null ? '—' : Math.round(flight.position.heading).toString()}
            unit="deg"
          />
        </div>
      </div>
    </div>
  );
};

export default FlightCard;
