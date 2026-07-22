import { ChevronLeft, ChevronRight, Plane } from 'lucide-react';

import { getAirline, resolveAirlineCode } from '@/lib/airlines';
import { getDisplayAccent } from '@/lib/displayColor';
import { calculateBearing, getCompassLabel, mapBearingToWindow, normalizeBearing } from '@/lib/windowPosition';
import { Flight } from '@/types/flight';
import { WindowPositionSettings } from '@/types/settings';

type WindowPositionRailProps = {
  flight: Flight;
  settings: WindowPositionSettings;
};

const WindowPositionRail = ({ flight, settings }: WindowPositionRailProps) => {
  const latitude = settings.latitude == null ? Number.NaN : Number(settings.latitude);
  const longitude = settings.longitude == null ? Number.NaN : Number(settings.longitude);
  const centerBearing = normalizeBearing(Number(settings.bearing ?? 90));
  const viewAngle = Math.min(180, Math.max(10, Number(settings.viewAngle ?? 90)));

  if (!settings.enabled || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const bearing = calculateBearing(
    { latitude, longitude },
    { latitude: flight.position.latitude, longitude: flight.position.longitude }
  );
  const position = mapBearingToWindow(bearing, centerBearing, viewAngle);
  const minimumBearing = normalizeBearing(centerBearing - viewAngle / 2);
  const maximumBearing = normalizeBearing(centerBearing + viewAngle / 2);
  const airlineCode = resolveAirlineCode(
    flight.airline.icao,
    flight.airline.iata,
    flight.flightNumber,
    flight.callsign
  );
  const accent = getDisplayAccent(getAirline(airlineCode).color);
  const markerTransform = position.percent <= 4
    ? 'translateX(0)'
    : position.percent >= 96
      ? 'translateX(-100%)'
      : 'translateX(-50%)';
  const roundedBearing = Math.round(bearing);

  return (
    <div
      className="absolute top-3 left-8 right-8 z-40 h-16 pointer-events-none select-none"
      aria-label={`Aircraft bearing ${roundedBearing} degrees, ${Math.round(position.percent)} percent across the window`}
    >
      <div className="absolute inset-x-0 top-0 flex items-center justify-between font-mono text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground/55">
        <span>{getCompassLabel(minimumBearing)} {Math.round(minimumBearing)}° · LEFT</span>
        <span>LOOKING {getCompassLabel(centerBearing)} · {Math.round(centerBearing)}°</span>
        <span>RIGHT · {getCompassLabel(maximumBearing)} {Math.round(maximumBearing)}°</span>
      </div>

      <div className="absolute inset-x-0 top-[2.7rem] h-px bg-gradient-to-r from-transparent via-muted-foreground/45 to-transparent">
        <i className="absolute left-0 -top-1 h-2 w-px bg-muted-foreground/35" />
        <i className="absolute left-1/2 -top-1 h-2 w-px bg-muted-foreground/35" />
        <i className="absolute right-0 -top-1 h-2 w-px bg-muted-foreground/35" />
      </div>

      <div
        className="absolute top-[1.2rem] flex flex-col items-center transition-[left] duration-1000 ease-out"
        style={{ left: `${position.percent}%`, transform: markerTransform }}
      >
        <div
          className="flex items-center gap-1 rounded-full border bg-black/90 px-2 py-1 font-mono text-[0.65rem] font-bold tracking-[0.08em] whitespace-nowrap"
          style={{ borderColor: `${accent}88`, color: position.visible ? '#fff' : '#b8b8bc', boxShadow: position.visible ? `0 0 18px ${accent}44` : undefined }}
        >
          {position.edge === 'left' && <ChevronLeft className="h-3 w-3" style={{ color: accent }} />}
          {getCompassLabel(bearing)} · {roundedBearing}°
          {position.edge === 'right' && <ChevronRight className="h-3 w-3" style={{ color: accent }} />}
        </div>
        {position.visible && (
          <Plane className="mt-0.5 h-4 w-4 rotate-90" style={{ color: accent, filter: `drop-shadow(0 0 5px ${accent}88)` }} />
        )}
      </div>
    </div>
  );
};

export default WindowPositionRail;
