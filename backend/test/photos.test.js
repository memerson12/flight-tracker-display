const assert = require('assert');
const request = require('supertest');
const path = require('path');
const TEST_ADMIN_PASSWORD = 'test-admin-password';
const TEST_MAX_PHOTO_SIZE = 1024 * 1024;

process.env.ADMIN_PASSWORD = TEST_ADMIN_PASSWORD;
process.env.MAX_PHOTO_SIZE = String(TEST_MAX_PHOTO_SIZE);

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
