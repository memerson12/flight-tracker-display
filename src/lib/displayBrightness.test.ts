import { describe, expect, it } from 'vitest';

import { getScheduledBrightness, isQuietHoursActive, parseClockMinutes } from './displayBrightness';

const timeZone = 'Australia/Brisbane';

const atBrisbaneTime = (isoTime: string) => new Date(`2026-08-02T${isoTime}+10:00`);

describe('display brightness schedule', () => {
  const overnightSettings = {
    brightness: 80,
    quietHours: {
      enabled: true,
      start: '22:00',
      end: '07:00',
      brightness: 5
    }
  };

  it('parses valid clock values and rejects invalid ones', () => {
    expect(parseClockMinutes('22:30')).toBe(1350);
    expect(parseClockMinutes('24:00')).toBeNull();
    expect(parseClockMinutes('7:00')).toBeNull();
  });

  it('handles quiet hours that cross midnight', () => {
    expect(isQuietHoursActive(atBrisbaneTime('23:00:00'), overnightSettings, timeZone)).toBe(true);
    expect(isQuietHoursActive(atBrisbaneTime('06:59:00'), overnightSettings, timeZone)).toBe(true);
    expect(isQuietHoursActive(atBrisbaneTime('07:00:00'), overnightSettings, timeZone)).toBe(false);
    expect(isQuietHoursActive(atBrisbaneTime('12:00:00'), overnightSettings, timeZone)).toBe(false);
  });

  it('handles a quiet period within one day', () => {
    const settings = {
      quietHours: { enabled: true, start: '13:00', end: '15:00', brightness: 0 }
    };
    expect(isQuietHoursActive(atBrisbaneTime('14:00:00'), settings, timeZone)).toBe(true);
    expect(isQuietHoursActive(atBrisbaneTime('16:00:00'), settings, timeZone)).toBe(false);
  });

  it('uses quiet brightness during the schedule and normal brightness otherwise', () => {
    expect(getScheduledBrightness(atBrisbaneTime('23:00:00'), overnightSettings, timeZone)).toBe(5);
    expect(getScheduledBrightness(atBrisbaneTime('12:00:00'), overnightSettings, timeZone)).toBe(80);
  });

  it('treats equal start and end times as no quiet period', () => {
    const settings = {
      brightness: 75,
      quietHours: { enabled: true, start: '09:00', end: '09:00', brightness: 0 }
    };
    expect(getScheduledBrightness(atBrisbaneTime('09:00:00'), settings, timeZone)).toBe(75);
  });

  it('clamps brightness values', () => {
    expect(getScheduledBrightness(atBrisbaneTime('12:00:00'), { brightness: 120 }, timeZone)).toBe(100);
    expect(getScheduledBrightness(atBrisbaneTime('12:00:00'), { brightness: -10 }, timeZone)).toBe(0);
  });
});
