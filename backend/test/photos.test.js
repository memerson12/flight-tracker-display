const assert = require('assert');
const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TEST_ADMIN_PASSWORD = 'test-admin-password';
const TEST_MAX_PHOTO_SIZE = 1024 * 1024;
const TEST_RUNTIME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'flight-tracker-tests-'));

process.env.ADMIN_PASSWORD = TEST_ADMIN_PASSWORD;
process.env.MAX_PHOTO_SIZE = String(TEST_MAX_PHOTO_SIZE);
process.env.PHOTO_STORAGE_DIR = path.join(TEST_RUNTIME_DIR, 'photos');
process.env.PHOTO_DB_PATH = path.join(TEST_RUNTIME_DIR, 'data', 'photos.db');
process.env.CONFIG_PATH = path.join(TEST_RUNTIME_DIR, 'config.json');

fs.mkdirSync(path.dirname(process.env.PHOTO_DB_PATH), { recursive: true });
fs.writeFileSync(process.env.CONFIG_PATH, JSON.stringify({
  provider: 'flightradar24',
  location: {
    latitude: 37.7749,
    longitude: -122.4194,
    radius: 25,
    name: 'Test monitoring area'
  },
  slideshow: { interval: 10000, shuffle: true, fitMode: 'cover' },
  windowPosition: {
    enabled: true,
    address: '123 Example Street',
    latitude: 37.7749,
    longitude: -122.4194,
    bearing: 90,
    viewAngle: 90
  },
  clock: { use24Hour: true, timeZone: 'UTC' },
  display: { brightness: 100 }
}, null, 2));

after(() => {
  const metadataStore = require('../lib/metadataStore');
  metadataStore.close();
  fs.rmSync(TEST_RUNTIME_DIR, { recursive: true, force: true });
});

describe('Photos API (smoke)', function() {
  it('GET /api/photos returns 200', function(done) {
    this.timeout(5000);
    const server = require('../server');
    request(server)
      .get('/api/photos')
      .expect(200)
      .end(function(err, res) {
        if (err) return done(err);
        if (!Array.isArray(res.body)) return done(new Error('Expected array'));
        done();
      });
  });

  it('POST/PUT/DELETE photo lifecycle', function(done) {
    this.timeout(5000);
    const server = require('../server');
    const fs = require('fs');
    // fixture file contains base64 payload; decode to buffer for upload
    const base64 = fs.readFileSync(path.join(__dirname, 'fixtures', '1x1.png'), 'utf8').toString().trim();
    const buffer = Buffer.from(base64, 'base64');

    request(server)
      .post('/api/photos')
      .set('Authorization', `Bearer ${TEST_ADMIN_PASSWORD}`)
      .attach('file', buffer, '1x1.png')
      .expect(201)
      .end(function(err, res) {
        if (err) return done(err);
        const body = Array.isArray(res.body) ? res.body[0] : res.body;
        if (!body || !body.id) return done(new Error('Invalid response'));
        if (Object.hasOwn(body, 'caption')) return done(new Error('Legacy caption field was returned'));
        if (Object.hasOwn(body, 'latitude') || Object.hasOwn(body, 'longitude')) {
          return done(new Error('Private GPS coordinates were returned'));
        }

        // Update slideshow visibility
        request(server)
          .put(`/api/photos/${body.id}`)
          .set('Authorization', `Bearer ${TEST_ADMIN_PASSWORD}`)
          .send({ enabled: false })
          .expect(200)
          .end(function(err2) {
            if (err2) return done(err2);

            // Delete
            request(server)
              .delete(`/api/photos/${body.id}`)
              .set('Authorization', `Bearer ${TEST_ADMIN_PASSWORD}`)
              .expect(204, done);
          });
      });
  });

  it('does not expose the SQLite database through public photo storage', async function() {
    const server = require('../server');
    await request(server)
      .get('/photos/photos.db')
      .expect(404);
  });

  it('omits private observer details from public settings', async function() {
    const server = require('../server');
    const publicResponse = await request(server)
      .get('/api/settings')
      .expect(200);

    assert.strictEqual(Object.hasOwn(publicResponse.body.windowPosition, 'address'), false);
    assert.strictEqual(Object.hasOwn(publicResponse.body.windowPosition, 'latitude'), false);
    assert.strictEqual(Object.hasOwn(publicResponse.body.windowPosition, 'longitude'), false);

    const adminResponse = await request(server)
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${TEST_ADMIN_PASSWORD}`)
      .expect(200);
    assert.strictEqual(Object.hasOwn(adminResponse.body.windowPosition, 'address'), true);
    assert.strictEqual(Object.hasOwn(adminResponse.body.windowPosition, 'latitude'), true);
    assert.strictEqual(Object.hasOwn(adminResponse.body.windowPosition, 'longitude'), true);
  });

  it('does not grant arbitrary origins cross-origin read access', async function() {
    const server = require('../server');
    const response = await request(server)
      .get('/api/settings')
      .set('Origin', 'https://untrusted.example')
      .expect(200);
    assert.strictEqual(response.headers['access-control-allow-origin'], undefined);

    await request(server)
      .options('/api/settings')
      .set('Origin', 'https://untrusted.example')
      .expect(403);
  });

  it('returns a useful JSON error for oversized photos', function(done) {
    this.timeout(5000);
    const server = require('../server');

    request(server)
      .post('/api/photos')
      .set('Authorization', `Bearer ${TEST_ADMIN_PASSWORD}`)
      .attach('file', Buffer.alloc(TEST_MAX_PHOTO_SIZE + 1), 'too-large.jpg')
      .expect(413)
      .expect('Content-Type', /json/)
      .end(function(err, res) {
        if (err) return done(err);
        assert.strictEqual(res.body.error, 'Each photo must be 1 MB or smaller.');
        done();
      });
  });

  it('returns a useful JSON error for unsupported files', function(done) {
    const server = require('../server');

    request(server)
      .post('/api/photos')
      .set('Authorization', `Bearer ${TEST_ADMIN_PASSWORD}`)
      .attach('file', Buffer.from('not an image'), 'notes.txt')
      .expect(400)
      .expect('Content-Type', /json/)
      .end(function(err, res) {
        if (err) return done(err);
        assert.strictEqual(res.body.error, 'Unsupported file type. Use JPEG, PNG, or WebP.');
        done();
      });
  });
});
