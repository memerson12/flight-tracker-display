import { describe, expect, it } from 'vitest';

import { getDisplayAccent } from './displayColor';

describe('getDisplayAccent', () => {
  it('preserves accents that are already bright enough', () => {
    expect(getDisplayAccent('#FFD100')).toBe('#FFD100');
  });

  it('lifts very dark brand colors for an OLED display', () => {
    expect(getDisplayAccent('#0033A1')).not.toBe('#0033A1');
    expect(getDisplayAccent('#5C0633')).not.toBe('#5C0633');
  });

  it('uses a safe fallback for malformed colors', () => {
    expect(getDisplayAccent('navy')).toBe('#00BCEB');
  });
});
