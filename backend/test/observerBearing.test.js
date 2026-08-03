const assert = require('assert');

const { calculateBearing, withObserverBearings } = require('../lib/observerBearing');

describe('observer bearing privacy transform', function() {
  it('calculates cardinal bearings without returning observer coordinates', function() {
    const north = calculateBearing(
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 0 }
    );
    assert.ok(Math.abs(north) < 0.0001);

    const payload = withObserverBearings({
      flights: [{
        id: 'flight-1',
        position: { latitude: 0, longitude: 1 }
      }]
    }, {
      enabled: true,
      latitude: 0,
      longitude: 0
    });

    assert.ok(Math.abs(payload.flights[0].position.observerBearing - 90) < 0.01);
    assert.strictEqual(Object.hasOwn(payload.flights[0].position, 'observerLatitude'), false);
    assert.strictEqual(Object.hasOwn(payload.flights[0].position, 'observerLongitude'), false);
  });

  it('leaves flights unchanged when the indicator is disabled', function() {
    const payload = { flights: [{ id: 'flight-1', position: { latitude: 1, longitude: 1 } }] };
    assert.strictEqual(withObserverBearings(payload, { enabled: false }), payload);
  });
});
