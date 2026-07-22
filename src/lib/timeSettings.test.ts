import { describe, expect, it } from 'vitest';

import { formatClockTime, inferTimeZone, isValidTimeZone, resolveTimeZone } from './timeSettings';

describe('display clock settings', () => {
  it('infers Brisbane time from the configured viewer coordinates', () => {
    expect(inferTimeZone(-27.4582173, 153.0503689)).toBe('Australia/Brisbane');
  });

  it('prefers a valid configured time zone over coordinate inference', () => {
    expect(resolveTimeZone('Pacific/Auckland', -27.4582173, 153.0503689)).toBe('Pacific/Auckland');
    expect(isValidTimeZone('Not/A_Time_Zone')).toBe(false);
  });

  it('formats the same instant in 24-hour and 12-hour time', () => {
    const instant = new Date('2026-07-21T12:05:00.000Z');
    expect(formatClockTime(instant, { use24Hour: true, timeZone: 'Australia/Brisbane' })).toBe('22:05');
    expect(formatClockTime(instant, { use24Hour: false, timeZone: 'Australia/Brisbane' })).toBe('10:05 pm');
  });
});
