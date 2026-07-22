import { describe, expect, it } from 'vitest';

import {
  calculateBearing,
  mapBearingToWindow,
  normalizeEpochMilliseconds,
  projectPosition
} from './windowPosition';

describe('window position mapping', () => {
  it('maps an east-facing 90 degree view from NE to SE', () => {
    expect(mapBearingToWindow(45, 90, 90)).toMatchObject({ percent: 0, visible: true });
    expect(mapBearingToWindow(90, 90, 90)).toMatchObject({ percent: 50, visible: true });
    expect(mapBearingToWindow(135, 90, 90)).toMatchObject({ percent: 100, visible: true });
  });

  it('pins aircraft outside the window view to the nearest edge', () => {
    expect(mapBearingToWindow(20, 90, 90)).toMatchObject({ percent: 0, visible: false, edge: 'left' });
    expect(mapBearingToWindow(160, 90, 90)).toMatchObject({ percent: 100, visible: false, edge: 'right' });
    expect(mapBearingToWindow(270, 90, 90).visible).toBe(false);
  });

  it('moves a south-to-north flight east of the observer from right to left', () => {
    const observer = { latitude: -27.4582173, longitude: 153.0503689 };
    const track = [
      { latitude: -27.478, longitude: 153.075 },
      { latitude: -27.4582173, longitude: 153.075 },
      { latitude: -27.438, longitude: 153.075 }
    ];
    const positions = track.map((point) => (
      mapBearingToWindow(calculateBearing(observer, point), 90, 90).percent
    ));

    expect(positions[0]).toBeGreaterThan(90);
    expect(positions[1]).toBeCloseTo(50, 1);
    expect(positions[2]).toBeLessThan(10);
  });

  it('projects aircraft motion from heading and groundspeed between polls', () => {
    const start = { latitude: -27.4582173, longitude: 153.075 };
    const projected = projectPosition(start, 0, 180, 10_000);

    expect(projected.latitude).toBeGreaterThan(start.latitude);
    expect(projected.longitude).toBeCloseTo(start.longitude, 4);
  });

  it('caps projection time and accepts provider timestamps in seconds', () => {
    const start = { latitude: 0, longitude: 0 };
    expect(projectPosition(start, 90, 360, 60_000)).toEqual(projectPosition(start, 90, 360, 30_000));
    expect(normalizeEpochMilliseconds(1_784_692_946)).toBe(1_784_692_946_000);
  });
});
