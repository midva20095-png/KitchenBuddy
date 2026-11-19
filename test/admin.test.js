'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const http = require('http');
const os = require('os');
const path = require('path');
const { startServer } = require('../src/server');
const { createStore } = require('../src/store');

function callRaw(port, urlPath, body, type, token, method) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      port,
      path: urlPath,
      method: method || 'POST',
      headers: {
        'content-type': type || 'application/octet-stream',
        'content-length': body ? body.length : 0,
        authorization: token ? `Bearer ${token}` : ''
      }
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

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
    assert.match(admin.body, /Кто зашёл/);
    assert.match(admin.body, /Подписчики/);
    assert.match(admin.body, /Рассылка/);
    assert.match(admin.body, /@keyframes neon/);
    assert.match(admin.body, /В чёрный список/);
    await store.markVisit('15', true);
    const visits = await call(port, 'GET', '/api/admin/clients?q=', null, token);
    assert.equal(JSON.parse(visits.body).rows.find(row => row.userId === '15').member, true);
    assert.doesNotMatch(admin.body, /Добавить человека/);
    assert.match(admin.body, /Рецепт с фото/);
    const ban = await call(port, 'POST', '/api/admin/block', { userId: '7777', blocked: true }, token);
    assert.equal(JSON.parse(ban.body).blocked, true);
    const banned = await call(port, 'GET', '/api/admin/clients?q=7777', null, token);
    assert.equal(JSON.parse(banned.body).rows[0].blocked, true);
    const free = await call(port, 'POST', '/api/admin/block', { userId: '7777', blocked: false }, token);
    assert.equal(JSON.parse(free.body).blocked, false);
    await store.setBlocked('15', false);
    await store.ensureClient('16', { name: 'Борис' }, '55');
    await store.markVisit('16', true);
    await store.ensureClient('18', { name: 'Тихий' }, '55');
    await store.markVisit('18', true);
    await store.setBlocked('18', true);
    const mailed = [];
    holder.send = async (peer) => {
      mailed.push(String(peer));
      if (String(peer) === '15') {
        const error = new Error('privacy');
        error.code = 901;
        throw error;
      }
    };
    const emptyMail = await call(port, 'POST', '/api/admin/broadcast', { text: '   ' }, token);
    assert.equal(emptyMail.status, 400);
    const mail = await call(port, 'POST', '/api/admin/broadcast', { text: 'Новый борщ' }, token);
    const mailBody = JSON.parse(mail.body);
    assert.equal(mail.status, 200);
    assert.equal(mailBody.sent, 1);
    assert.equal(mailBody.thrown, 1);
    assert.deepEqual(mailed.slice().sort(), ['15', '16']);
    assert.equal((await store.listClients('15')).find(row => row.userId === '15').dmClosed, true);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const boundary = 'kbBound';
    const raw = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nБорщ с фото\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="category"\r\n\r\nsoup\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="body"\r\n\r\nСвекла и бульон\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    const uploaded = await callRaw(port, '/api/admin/recipe', raw, `multipart/form-data; boundary=${boundary}`, token);
    assert.equal(uploaded.status, 200);
    const again = JSON.parse((await call(port, 'GET', '/api/admin/catalog', null, token)).body);
    const row = again.rows.find(item => item.title === 'Борщ с фото');
    assert.equal(row.hasPhoto, true);
    assert.equal(row.shelf, 'Супы');
    assert.equal(row.source, 'own');
    const shot = await callRaw(port, '/api/admin/recipe-photo?id=' + encodeURIComponent(row.id), null, '', token, 'GET');
    assert.equal(shot.status, 200);
    assert.equal(shot.body.equals(png), true);
    await store.saveCatalog('55', { category: 'soup', title: 'Борщ с фото', body: 'новый текст', source: 'own' });
    const kept = await store.catalogPhoto(row.id);
    assert.equal(kept.bytes.equals(png), true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
