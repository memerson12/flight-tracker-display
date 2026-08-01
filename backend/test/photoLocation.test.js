const assert = require('assert');

const {
  readEmbeddedLocation,
  reverseGeocodeLocation,
  resolvePhotoLocation
} = require('../lib/photoLocation');

describe('photo location metadata', function() {
  it('reads valid embedded GPS coordinates', async function() {
    const location = await readEmbeddedLocation('photo.jpg', async () => ({
      latitude: 37.4636,
      longitude: -122.4286
    }));

    assert.deepStrictEqual(location, { latitude: 37.4636, longitude: -122.4286 });
  });

  it('ignores missing or invalid embedded GPS coordinates', async function() {
    assert.strictEqual(await readEmbeddedLocation('photo.jpg', async () => undefined), null);
    assert.strictEqual(await readEmbeddedLocation('photo.jpg', async () => ({
      latitude: 100,
      longitude: -122.4286
    })), null);
  });

  it('resolves coordinates to a coarse Mapbox place label', async function() {
    let requestedUrl = '';
    const location = await reverseGeocodeLocation(37.4636, -122.4286, {
      accessToken: 'test-token',
      fetchImpl: async (url) => {
        requestedUrl = url;
        return {
          ok: true,
          json: async () => ({
            features: [{ place_name: 'Half Moon Bay, California, United States' }]
          })
        };
      }
    });

    assert.strictEqual(location, 'Half Moon Bay, California, United States');
    assert.match(requestedUrl, /-122\.428600,37\.463600/);
    assert.match(requestedUrl, /types=place%2Clocality%2Cregion%2Ccountry/);
  });

  it('keeps coordinates when reverse geocoding is unavailable', async function() {
    const result = await resolvePhotoLocation('photo.jpg', {
      gpsReader: async () => ({ latitude: -27.45, longitude: 153.04 }),
      accessToken: ''
    });

    assert.deepStrictEqual(result, {
      latitude: -27.45,
      longitude: 153.04,
      location: null
    });
  });
});
