'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startServer } = require('../src/server');

function get(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ port, path }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });
}

function post(port, path, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request({
      port,
      path,
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('страница здоровья не показывает секреты', async () => {
  const server = startServer({
    port: 0,
    config: { port: 0, groupId: '55', communityName: 'Кухня', gigaConfigured: false },
    state: { vkOnline: false, vkHint: '<b>нет ключа</b>', communityName: 'Кухня' }
  });
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  try {
    const health = await get(port, '/health');
    assert.equal(health.status, 200);
    assert.deepEqual(JSON.parse(health.body), { ok: true, vk: false });
    const page = await get(port, '/');
    assert.match(page.body, /Кухонный помощник работает/);
    assert.match(page.body, /ключ не задан/);
    assert.match(page.body, /&lt;b&gt;нет ключа&lt;\/b&gt;/);
    assert.doesNotMatch(page.body, /<b>/);
    const app = await get(port, '/app');
    assert.equal(app.status, 200);
    assert.match(app.body, /Поставить на страницу/);
    assert.match(app.body, /Поиск рецептов/);
    const pin = await post(port, '/api/app/pin', { token: 'secret-widget-token-value', groupId: '99' });
    assert.equal(pin.status, 400);
    assert.doesNotMatch(pin.body, /secret-widget-token-value/);
    const placed = [];
    server.close();
    const second = startServer({
      port: 0,
      config: { port: 0, groupId: '243405772', communityName: 'Кухня', gigaConfigured: false },
      state: {},
      pin: async (token, groupId) => { placed.push({ token, groupId }); }
    });
    await new Promise(resolve => second.once('listening', resolve));
    const pinPort = second.address().port;
    const ok = await post(pinPort, '/api/app/pin', { token: 'secret-widget-token-value', groupId: '243405772' });
    assert.equal(ok.status, 200);
    assert.deepEqual(JSON.parse(ok.body), { ok: true });
    assert.equal(placed[0].groupId, '243405772');
    assert.doesNotMatch(ok.body, /secret-widget-token-value/);
    await new Promise(resolve => second.close(resolve));
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
});
