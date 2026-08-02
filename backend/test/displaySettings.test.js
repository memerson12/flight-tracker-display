const assert = require('assert');
const test = require('node:test');

const {
  normalizeClockSettings,
  normalizeDisplaySettings,
  normalizeWindowPositionSettings
} = require('../lib/displaySettings');

test('preserves saved observer details while toggling the indicator off', () => {
    const existing = {
      enabled: true,
      address: '85 Macquarie Street, Teneriffe QLD 4005 Australia',
      latitude: -27.4582173,
      longitude: 153.0503689,
      bearing: 90,
      viewAngle: 90
    };

    assert.deepStrictEqual(normalizeWindowPositionSettings({ enabled: false }, existing), {
      ...existing,
      enabled: false
    });
});

test('normalizes orientation and rejects invalid coordinates', () => {
    const normalized = normalizeWindowPositionSettings({
      enabled: true,
      latitude: 120,
      longitude: 'not-a-number',
      bearing: 450,
      viewAngle: 220
    });

    assert.strictEqual(normalized.latitude, null);
    assert.strictEqual(normalized.longitude, null);
    assert.strictEqual(normalized.bearing, 90);
    assert.strictEqual(normalized.viewAngle, 180);
});

test('keeps missing observer coordinates empty', () => {
  const normalized = normalizeWindowPositionSettings();

  assert.strictEqual(normalized.latitude, null);
  assert.strictEqual(normalized.longitude, null);
});

test('normalizes display clock preferences', () => {
  assert.deepStrictEqual(normalizeClockSettings({
    use24Hour: false,
    timeZone: 'Australia/Brisbane'
  }), {
    use24Hour: false,
    timeZone: 'Australia/Brisbane'
  });

  assert.strictEqual(normalizeClockSettings({ timeZone: 'Not/A_Time_Zone' }).timeZone, '');
});

test('normalizes brightness and quiet hours', () => {
  assert.deepStrictEqual(normalizeDisplaySettings({
    brightness: 85.4,
    quietHours: {
      enabled: true,
      start: '21:30',
      end: '06:45',
      brightness: 5
    }
  }), {
    brightness: 85,
    quietHours: {
      enabled: true,
      start: '21:30',
      end: '06:45',
      brightness: 5
    }
  });
});

test('clamps brightness and replaces invalid quiet-hour times', () => {
  const normalized = normalizeDisplaySettings({
    brightness: 150,
    quietHours: {
      enabled: true,
      start: '25:00',
      end: 'not-a-time',
      brightness: -20
    }
  });

  assert.strictEqual(normalized.brightness, 100);
  assert.strictEqual(normalized.quietHours.start, '22:00');
  assert.strictEqual(normalized.quietHours.end, '07:00');
  assert.strictEqual(normalized.quietHours.brightness, 0);
});
