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
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
