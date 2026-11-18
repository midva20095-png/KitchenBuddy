'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const http = require('http');
const os = require('os');
const path = require('path');
const { startServer } = require('../src/server');
const { createStore } = require('../src/store');

function call(port, method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      port,
      path: urlPath,
      method,
      headers: {
        'content-type': 'application/json',
        authorization: token ? `Bearer ${token}` : ''
      }
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test('админка показывает клиентов и не отдаёт пароль', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kitchen-admin-'));
  const store = createStore(dir);
  await store.ensureClient('15', { name: 'Анна', username: 'anna' }, '243405772');
  await store.saveShared('15', { title: 'Сырники', body: 'Творог и яйцо, обжарить.', source: 'own' });
  await store.saveCatalog('15', { category: 'soup', title: 'Борщ', query: 'борщ', body: 'свекла', source: 'found' });
  const holder = { store };
  const server = startServer({
    port: 0,
    config: {
      port: 0,
      groupId: '55',
      communityName: 'Кухня',
      gigaConfigured: false,
      adminPassword: 'secret-pass'
    },
    state: { clients: 'файл' },
    holder
  });
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  try {
    const page = await call(port, 'GET', '/');
    assert.match(page.body, /Админка/);
    assert.doesNotMatch(page.body, /secret-pass/);
    const admin = await call(port, 'GET', '/admin');
    assert.match(admin.body, /Админка кухни/);
    assert.match(admin.body, /Поставить на Android/);
    assert.match(admin.body, /Общая база/);
    assert.doesNotMatch(admin.body, /secret-pass/);
    const manifest = await call(port, 'GET', '/admin/manifest.webmanifest');
    assert.equal(manifest.status, 200);
    assert.equal(JSON.parse(manifest.body).start_url, '/admin');
    assert.equal(JSON.parse(manifest.body).display, 'standalone');
    const icon = await call(port, 'GET', '/admin/icon-192.png');
    assert.equal(icon.status, 200);
    assert.ok(icon.body.length > 100);
    const worker = await call(port, 'GET', '/sw.js');
    assert.match(worker.body, /serviceWorker|fetch/);
    const bad = await call(port, 'POST', '/api/admin/login', { password: 'nope' });
    assert.equal(bad.status, 401);
    const good = await call(port, 'POST', '/api/admin/login', { password: 'secret-pass' });
    assert.equal(good.status, 200);
    const token = JSON.parse(good.body).token;
    const closed = await call(port, 'GET', '/api/admin/stats');
    assert.equal(closed.status, 401);
    const stats = await call(port, 'GET', '/api/admin/stats', null, token);
    assert.equal(JSON.parse(stats.body).stats.clients, 1);
    const people = await call(port, 'GET', '/api/admin/clients?q=' + encodeURIComponent('анна'), null, token);
    assert.equal(JSON.parse(people.body).rows[0].name, 'Анна');
    const card = await call(port, 'GET', '/api/admin/client?id=15', null, token);
    assert.equal(JSON.parse(card.body).user.username, 'anna');
    const catalog = await call(port, 'GET', '/api/admin/catalog', null, token);
    assert.equal(JSON.parse(catalog.body).rows[0].title, 'Борщ');
    assert.equal(JSON.parse(catalog.body).rows[0].shelf, 'Супы');
    const shared = await call(port, 'GET', '/api/admin/shared', null, token);
    assert.equal(JSON.parse(shared.body).rows[0].title, 'Сырники');
    const block = await call(port, 'POST', '/api/admin/block', { userId: '15', blocked: true }, token);
    assert.equal(JSON.parse(block.body).blocked, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
