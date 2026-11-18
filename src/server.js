'use strict';

const http = require('http');

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
  </dl>
</body>
</html>`;
}

function startServer(options) {
  const config = options.config;
  const state = options.state || {};
  const port = options.port || config.port;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/health') {
      const body = JSON.stringify({ ok: true, vk: Boolean(state.vkOnline) });
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(body);
      return;
    }
    const body = statusHtml(config, state);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  });
  server.listen(port, '0.0.0.0');
  return server;
}

module.exports = { startServer, statusHtml };
