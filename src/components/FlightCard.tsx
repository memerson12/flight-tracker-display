import { Plane, ArrowDown, ArrowRight, ArrowUp, Gauge, Minus, Mountain } from 'lucide-react';

import { getAircraftName, getAirline, getLogoUrl, extractAirlineCode } from '@/lib/airlines';
import { Flight } from '@/types/flight';

interface FlightCardProps {
  flight: Flight;
}

const FlightCard = ({ flight }: FlightCardProps) => {
  const rawAirlineCode = flight.airline.iata || extractAirlineCode(flight.flightNumber);
  const airlineCode = rawAirlineCode.length === 2 ? rawAirlineCode : extractAirlineCode(flight.flightNumber);
  const airline = getAirline(airlineCode);
  const airlineLogo = getLogoUrl(airlineCode);
  const aircraftName = getAircraftName(flight.aircraft.icao || flight.aircraft.type);

  const getVerticalIcon = () => {
    if (flight.position.verticalSpeed > 100) return <ArrowUp className="w-5 h-5 text-aviation-green" />;
    if (flight.position.verticalSpeed < -100) return <ArrowDown className="w-5 h-5 text-aviation-amber" />;
    return <Minus className="w-5 h-5 text-muted-foreground" />;
  };

  const formatAltitude = (alt: number) => {
    return alt.toLocaleString() + ' ft';
  };

  const formatSpeed = (speed: number) => {
    return speed + ' kts';
  };

  return (
    <div 
      className="w-full h-full flex flex-col justify-center items-center p-8 animate-fade-in"
      style={{ '--airline-color': airline.color } as React.CSSProperties}
    >
      {/* Ambient glow effect */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="w-[800px] h-[400px] rounded-full blur-[120px] animate-pulse-glow"
          style={{ backgroundColor: `${airline.color}30` }}
        />
      </div>

      <div className="relative z-10 w-full max-w-5xl">
        {/* Airline header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-6">
            {airlineLogo ? (
              <div
                className="w-24 h-24 rounded-2xl backdrop-blur-sm flex items-center justify-center p-4 oled-glow"
                style={{ backgroundColor: `${airline.color}22` }}
              >
                <img
                  src={airlineLogo}
                  alt={airline.name}
                  className="max-w-full max-h-full object-contain filter brightness-110"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            ) : (
              <div
                className="w-24 h-24 rounded-2xl flex items-center justify-center oled-glow"
                style={{ backgroundColor: `${airline.color}22` }}
              >
                <Plane className="w-12 h-12" style={{ color: airline.color }} />
              </div>
            )}
            <div>
              <h1 className="text-5xl font-bold text-foreground tracking-tight">
                {airline.name}
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <span
                  className="font-mono text-2xl text-glow-cyan"
                  style={{ color: airline.color }}
                >
                  {flight.flightNumber}
                </span>
                <span className="text-muted-foreground text-lg">•</span>
                <span className="text-muted-foreground text-lg">
                  {flight.callsign}
                </span>
              </div>
            </div>
          </div>
          
          {/* Status badge */}
          <div
            className="px-5 py-2.5 rounded-full border"
            style={{ backgroundColor: `${airline.color}22`, borderColor: `${airline.color}55` }}
          >
            <span className="font-semibold uppercase tracking-wider text-sm" style={{ color: airline.color }}>
              {flight.status}
            </span>
          </div>
        </div>

        {/* Route display */}
        <div className="card-glass rounded-3xl p-10 mb-8" style={{ boxShadow: `0 0 60px -10px ${airline.color}40` }}>
          <div className="flex items-center justify-between">
            {/* Departure */}
            <div className="text-center flex-1">
              <div className="text-8xl font-bold text-foreground tracking-tighter mb-2">
                {flight.departure.iata}
              </div>
              <div className="text-xl text-muted-foreground mb-1">
                {flight.departure.city}
              </div>
              {flight.departure.time && (
                <div className="font-mono text-lg text-primary/70">
                  DEP {flight.departure.time}
                </div>
              )}
            </div>

            {/* Flight path indicator */}
            <div className="flex-1 flex flex-col items-center px-8">
              <div className="flex items-center gap-3 w-full justify-center">
                <div
                  className="h-px flex-1"
                  style={{ background: `linear-gradient(to right, transparent, ${airline.color}, transparent)` }}
                />
                <Plane
                  className="w-10 h-10 rotate-90 text-glow-cyan"
                  style={{ color: airline.color }}
                />
                <ArrowRight className="w-8 h-8" style={{ color: `${airline.color}99` }} />
                <div
                  className="h-px flex-1"
                  style={{ background: `linear-gradient(to right, ${airline.color}, ${airline.color}, transparent)` }}
                />
              </div>
              <div className="mt-4 font-mono text-sm text-muted-foreground">
                {aircraftName}
              </div>
              <div className="font-mono text-xs text-muted-foreground/60">
                {flight.aircraft.registration}
              </div>
            </div>

            {/* Arrival */}
            <div className="text-center flex-1">
              <div className="text-8xl font-bold text-foreground tracking-tighter mb-2">
                {flight.arrival.iata}
              </div>
              <div className="text-xl text-muted-foreground mb-1">
                {flight.arrival.city}
              </div>
              {flight.arrival.time && (
                <div className="font-mono text-lg text-aviation-green">
                  ARR {flight.arrival.time}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Flight data grid */}
        <div className="grid grid-cols-4 gap-4">
          {/* Altitude */}
          <div className="card-glass rounded-2xl p-6 text-center" style={{ boxShadow: `0 0 30px -8px ${airline.color}30` }}>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Mountain className="w-5 h-5" style={{ color: `${airline.color}aa` }} />
              <span className="text-sm text-muted-foreground uppercase tracking-wider">Altitude</span>
            </div>
            <div className="font-mono text-4xl font-bold text-foreground">
              {formatAltitude(flight.position.altitude)}
            </div>
          </div>

          {/* Speed */}
          <div className="card-glass rounded-2xl p-6 text-center" style={{ boxShadow: `0 0 30px -8px ${airline.color}30` }}>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Gauge className="w-5 h-5" style={{ color: `${airline.color}aa` }} />
              <span className="text-sm text-muted-foreground uppercase tracking-wider">Speed</span>
            </div>
            <div className="font-mono text-4xl font-bold text-foreground">
              {formatSpeed(flight.position.speed)}
            </div>
          </div>

          {/* Vertical Speed */}
          <div className="card-glass rounded-2xl p-6 text-center" style={{ boxShadow: `0 0 30px -8px ${airline.color}30` }}>
            <div className="flex items-center justify-center gap-2 mb-2">
              {getVerticalIcon()}
              <span className="text-sm text-muted-foreground uppercase tracking-wider">V/S</span>
            </div>
            <div className="font-mono text-4xl font-bold text-foreground">
              {flight.position.verticalSpeed > 0 ? '+' : ''}{flight.position.verticalSpeed}
              <span className="text-xl text-muted-foreground ml-1">fpm</span>
            </div>
          </div>

          {/* Heading */}
          <div className="card-glass rounded-2xl p-6 text-center" style={{ boxShadow: `0 0 30px -8px ${airline.color}30` }}>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Plane className="w-5 h-5" style={{ color: `${airline.color}aa`, transform: `rotate(${flight.position.heading}deg)` }} />
              <span className="text-sm text-muted-foreground uppercase tracking-wider">Heading</span>
            </div>
            <div className="font-mono text-4xl font-bold text-foreground">
              {flight.position.heading}°
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlightCard;
