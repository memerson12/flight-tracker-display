const assert = require('assert');
const test = require('node:test');

const { normalizeWindowPositionSettings } = require('../lib/displaySettings');

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
