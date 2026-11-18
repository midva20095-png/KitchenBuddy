'use strict';

const crypto = require('crypto');

const PAGE = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Админка · Кухонный</title>
  <style>
    body { margin: 0 auto; max-width: 880px; padding: 20px; font: 16px/1.45 system-ui, sans-serif; background: #fffaf5; color: #1c1917; }
    h1 { font-size: 1.4rem; margin: 0 0 8px; }
    h2 { font-size: 1.05rem; margin: 0 0 8px; }
    .card { background: #fff; border: 1px solid #e7e5e4; border-radius: 14px; padding: 14px; margin: 12px 0; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
    input, button { font: inherit; }
    input { flex: 1; min-width: 160px; padding: 10px 12px; border-radius: 10px; border: 1px solid #d6d3d1; }
    button { border: 0; border-radius: 10px; padding: 10px 14px; background: #9a3412; color: #fff; font-weight: 700; cursor: pointer; }
    button.ghost { background: #fff; color: #1c1917; border: 1px solid #d6d3d1; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
    .stat { background: #fff7ed; border-radius: 12px; padding: 10px; }
    .stat b { display: block; font-size: 1.4rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #e7e5e4; vertical-align: top; }
    th { color: #78716c; font-size: 13px; }
    .bad { color: #be123c; }
    .note { color: #57534e; }
    a { color: #9a3412; }
  </style>
</head>
<body>
  <h1>Админка кухни</h1>
  <p class="note" id="lead">Клиенты, рецепты и то, чем поделились.</p>
  <div class="card" id="login">
    <div class="row">
      <input id="pass" type="password" placeholder="Пароль администратора">
      <button type="button" id="enter">Войти</button>
    </div>
    <p id="err" class="bad"></p>
  </div>
  <div id="app" style="display:none">
    <div class="row"><button type="button" class="ghost" id="out">Выйти</button></div>
    <div class="card"><h2>Сводка</h2><div class="grid" id="stats"></div><p class="note" id="engine"></p></div>
    <div class="card">
      <h2>Клиенты</h2>
      <div class="row"><input id="q" placeholder="Имя или id"><button type="button" id="find">Найти</button></div>
      <table><thead><tr><th>Человек</th><th>Сообщения</th><th>Рецепты</th><th>Был</th></tr></thead><tbody id="people"></tbody></table>
    </div>
    <div class="card" id="card" style="display:none"></div>
    <div class="card"><h2>Поделились</h2><table><thead><tr><th>Рецепт</th><th>Кто</th><th>Где</th></tr></thead><tbody id="shared"></tbody></table></div>
  </div>
  <script>
    let token = sessionStorage.getItem('kb_admin') || '';
    const $ = id => document.getElementById(id);
    async function api(path, options) {
      const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token } }, options || {}));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не вышло');
      return data;
    }
    function when(value) {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return date.toLocaleString('ru-RU');
    }
    async function login() {
      $('err').textContent = '';
      try {
        const data = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('pass').value }) });
        token = data.token;
        sessionStorage.setItem('kb_admin', token);
        $('login').style.display = 'none';
        $('app').style.display = 'block';
        await load();
      } catch (error) {
        $('err').textContent = error.message;
      }
    }
    async function load() {
      const pack = await api('/api/admin/stats');
      const stats = pack.stats || {};
      const cells = [
        ['Клиенты', stats.clients],
        ['Сегодня', stats.newDay],
        ['Были сегодня', stats.activeDay],
        ['Рецепты', stats.recipes],
        ['Поделились', stats.shared],
        ['Закрыты', stats.blocked]
      ];
      $('stats').innerHTML = cells.map(item => '<div class="stat"><b>' + item[1] + '</b>' + item[0] + '</div>').join('');
      $('engine').textContent = stats.engine === 'postgres' ? 'Память: PostgreSQL.' : 'Память: файл на сервере. Чтобы карточки переживали деплой, соедините Postgres и переменную DATABASE_URL.';
      await search();
      const shared = await api('/api/admin/shared');
      $('shared').innerHTML = (shared.rows || []).map(row => '<tr><td>' + escapeHtml(row.title) + '</td><td>' + escapeHtml(row.name || row.userId) + '</td><td>' + (row.status === 'posted' ? 'на стене' : 'сохранено') + '</td></tr>').join('') || '<tr><td colspan="3">Пока никто не делился.</td></tr>';
    }
    async function search() {
      const data = await api('/api/admin/clients?q=' + encodeURIComponent($('q').value || ''));
      $('people').innerHTML = (data.rows || []).map(row => '<tr><td><a href="#" data-id="' + row.userId + '">' + escapeHtml(row.name || row.username || row.userId) + '</a>' + (row.blocked ? ' · закрыт' : '') + '</td><td>' + row.messages + '</td><td>' + row.recipes + '</td><td>' + when(row.lastSeen) + '</td></tr>').join('') || '<tr><td colspan="4">Пока никого нет. Напишите боту.</td></tr>';
    }
    async function openCard(id) {
      const data = await api('/api/admin/client?id=' + encodeURIComponent(id));
      const user = data.user;
      const fav = (data.favorites || []).map(escapeHtml).join(', ') || 'пусто';
      const log = (data.log || []).slice(0, 12).map(item => '<li>' + escapeHtml(item.kind) + (item.body ? ': ' + escapeHtml(item.body) : '') + '</li>').join('');
      $('card').style.display = 'block';
      $('card').innerHTML = '<h2>' + escapeHtml(user.name || user.userId) + '</h2><p class="note">id ' + escapeHtml(user.userId) + (user.username ? ' · ' + escapeHtml(user.username) : '') + '<br>Сообщество: ' + escapeHtml(user.groupId || '—') + '<br>С ' + when(user.createdAt) + ', был ' + when(user.lastSeen) + '</p><p>Избранное: ' + fav + '</p><ul>' + log + '</ul><button type="button" id="block">' + (user.blocked ? 'Открыть бота' : 'Закрыть бота') + '</button>';
      $('block').onclick = async () => {
        await api('/api/admin/block', { method: 'POST', body: JSON.stringify({ userId: user.userId, blocked: !user.blocked }) });
        await openCard(id);
        await load();
      };
    }
    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }
    $('enter').onclick = login;
    $('find').onclick = () => search().catch(error => alert(error.message));
    $('out').onclick = () => { sessionStorage.removeItem('kb_admin'); location.reload(); };
    $('people').onclick = event => {
      const link = event.target.closest('[data-id]');
      if (!link) return;
      event.preventDefault();
      openCard(link.getAttribute('data-id')).catch(error => alert(error.message));
    };
    if (token) {
      $('login').style.display = 'none';
      $('app').style.display = 'block';
      load().catch(() => { sessionStorage.removeItem('kb_admin'); location.reload(); });
    }
  </script>
</body>
</html>`;

function sameSecret(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function createAdmin(options) {
  const config = options.config || {};
  const holder = options.holder || {};
  const sessions = new Map();

  function tokenOk(req) {
    const header = String(req.headers.authorization || '');
    const match = header.match(/^Bearer\s+(\S+)$/i);
    const token = match ? match[1] : '';
    const until = sessions.get(token);
    if (!until || until < Date.now()) {
      sessions.delete(token);
      return false;
    }
    return true;
  }

  function send(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  }

  function readBody(req) {
    return new Promise(resolve => {
      const chunks = [];
      let size = 0;
      req.on('data', chunk => {
        size += chunk.length;
        if (size > 20000) req.destroy();
        else chunks.push(chunk);
      });
      req.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
        catch (error) { resolve({}); }
      });
      req.on('error', () => resolve({}));
    });
  }

  function store() {
    return holder.store || null;
  }

  async function handle(req, res, url) {
    if (url.pathname === '/admin' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(PAGE);
      return true;
    }
    if (!url.pathname.startsWith('/api/admin/')) return false;
    if (url.pathname === '/api/admin/login' && req.method === 'POST') {
      const body = await readBody(req);
      if (!config.adminPassword) {
        send(res, 503, { error: 'Задайте ADMIN_PASSWORD в переменных сервиса.' });
        return true;
      }
      if (!sameSecret(body.password, config.adminPassword)) {
        send(res, 401, { error: 'Пароль не подошёл.' });
        return true;
      }
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
      send(res, 200, { token });
      return true;
    }
    if (!tokenOk(req)) {
      send(res, 401, { error: 'Войдите снова.' });
      return true;
    }
    const db = store();
    if (!db || !db.stats) {
      send(res, 503, { error: 'База ещё открывается.' });
      return true;
    }
    try {
      if (url.pathname === '/api/admin/stats') {
        send(res, 200, { stats: await db.stats() });
      } else if (url.pathname === '/api/admin/clients') {
        send(res, 200, { rows: await db.listClients(url.searchParams.get('q') || '') });
      } else if (url.pathname === '/api/admin/client') {
        const card = await db.clientCard(url.searchParams.get('id') || '');
        if (!card) send(res, 404, { error: 'Клиент не найден.' });
        else send(res, 200, card);
      } else if (url.pathname === '/api/admin/shared') {
        send(res, 200, { rows: await db.listShared() });
      } else if (url.pathname === '/api/admin/block' && req.method === 'POST') {
        const body = await readBody(req);
        const blocked = await db.setBlocked(body.userId, Boolean(body.blocked));
        send(res, 200, { blocked });
      } else {
        send(res, 404, { error: 'Нет такого раздела.' });
      }
    } catch (error) {
      send(res, 500, { error: 'Не прочитала базу.' });
    }
    return true;
  }

  return { handle };
}

module.exports = { createAdmin, PAGE };
