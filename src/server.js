'use strict';

const http = require('http');
const { createAdmin } = require('./admin');
const { appPage } = require('./app-page');
const { pinSearchButton } = require('./widget');

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function statusHtml(config, state) {
  const online = state && state.vkOnline;
  const hint = escapeHtml((state && state.vkHint) || '');
  const name = escapeHtml((state && state.communityName) || config.communityName || 'Кухня');
  const group = escapeHtml(config.groupId || 'не задан');
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Кухонный помощник</title>
  <style>
    body { font-family: sans-serif; margin: 2rem; line-height: 1.45; color: #1c1917; background: #fffaf5; }
    h1 { font-size: 1.4rem; }
    dt { font-weight: 600; margin-top: 0.8rem; }
  </style>
</head>
<body>
  <h1>Кухонный помощник работает</h1>
  <dl>
    <dt>Сообщество</dt><dd>${name}, id ${group}</dd>
    <dt>ВКонтакте</dt><dd>${online ? 'подключено' : 'нет связи'}${hint ? `. ${hint}` : ''}</dd>
    <dt>GigaChat</dt><dd>${config.gigaConfigured ? 'ключ задан' : 'ключ не задан'}</dd>
    <dt>База клиентов</dt><dd>${escapeHtml((state && state.clients) || 'ещё не открыта')}</dd>
    <dt>Админка</dt><dd><a href="/admin">/admin</a></dd>
  </dl>
</body>
</html>`;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('big'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function startServer(options) {
  const config = options.config;
  const state = options.state || {};
  const port = options.port || config.port;
  const pin = options.pin || pinSearchButton;
  const admin = createAdmin({ config, holder: options.holder || {} });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/health') {
      const body = JSON.stringify({ ok: true, vk: Boolean(state.vkOnline) });
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(body);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/app') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(appPage());
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/app/pin') {
      readBody(req, 8000).then(async raw => {
        let payload = {};
        try { payload = JSON.parse(raw || '{}'); } catch (error) { payload = {}; }
        const groupId = String(payload.groupId || '').replace(/\D/g, '');
        const expected = String(config.groupId || '').replace(/\D/g, '');
        const token = String(payload.token || '');
        if (!expected || groupId !== expected) {
          sendJson(res, 400, { ok: false, error: 'Откройте приложение из сообщества KitchenBuddy.' });
          return;
        }
        if (token.length < 20 || token.length > 2000) {
          sendJson(res, 400, { ok: false, error: 'ВК не выдал разрешение на кнопку.' });
          return;
        }
        await pin(token, groupId);
        sendJson(res, 200, { ok: true });
      }).catch(error => {
        if (res.headersSent) return;
        const message = String((error && error.message) || 'Кнопку не удалось поставить.').replace(/access_token=[^&\s]+/g, '');
        sendJson(res, 400, { ok: false, error: message.slice(0, 180) });
      });
      return;
    }
    admin.handle(req, res, url).then(done => {
      if (done) return;
      const page = statusHtml(config, state);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(page);
    }).catch(() => {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Ошибка');
      }
    });
  });
  server.listen(port, '0.0.0.0');
  return server;
}

module.exports = { startServer, statusHtml };
