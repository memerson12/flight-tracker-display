const assert = require('assert');
const request = require('supertest');
const path = require('path');

describe('Photos API (smoke)', function() {
  it('GET /api/photos returns 200', function(done) {
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
    // admin auth: read password from config.json or env
    const cfg = require('../config.json');
    const password = process.env.ADMIN_PASSWORD || cfg.adminPassword || 'admin';
    const fs = require('fs');
    // fixture file contains base64 payload; decode to buffer for upload
    const base64 = fs.readFileSync(path.join(__dirname, 'fixtures', '1x1.png'), 'utf8').toString().trim();
    const buffer = Buffer.from(base64, 'base64');

    request(server)
      .post('/api/photos')
      .set('Authorization', `Bearer ${password}`)
      .attach('file', buffer, '1x1.png')
      .expect(201)
      .end(function(err, res) {
        if (err) return done(err);
        const body = res.body;
        if (!body || !body.id) return done(new Error('Invalid response'));

        // Update caption
        request(server)
          .put(`/api/photos/${body.id}`)
          .set('Authorization', `Bearer ${password}`)
          .send({ caption: 'test' })
          .expect(200)
          .end(function(err2) {
            if (err2) return done(err2);

            // Delete
            request(server)
              .delete(`/api/photos/${body.id}`)
              .set('Authorization', `Bearer ${password}`)
              .expect(204, done);
          });
      });
  });
});
