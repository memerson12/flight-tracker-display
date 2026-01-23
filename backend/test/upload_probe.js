const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

async function run() {
  const cfg = require('../config.json');
  const password = process.env.ADMIN_PASSWORD || cfg.adminPassword || 'admin';
  const form = new FormData();
  form.append('file', fs.createReadStream(path.join(__dirname, 'fixtures', '1x1.png')));
  try {
    const res = await axios.post('http://localhost:8000/api/photos', form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${password}` },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    console.log('status', res.status, res.data);
  } catch (err) {
    if (err.response) console.error('resp', err.response.status, err.response.data);
    else console.error(err.message);
  }
}

run();
