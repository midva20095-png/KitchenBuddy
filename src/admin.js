'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { sectionById, sectionIds } = require('./menu');

function htmlEscape(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function shelfOptions() {
  return sectionIds().map(id => {
    const node = sectionById(id);
    if (!node) return '';
    return `<option value="${htmlEscape(id)}">${htmlEscape(node.short || node.title)}</option>`;
  }).join('');
}

const ICON192 = fs.readFileSync(path.join(__dirname, '..', 'assets', 'admin-icon-192.png'));
const ICON512 = fs.readFileSync(path.join(__dirname, '..', 'assets', 'admin-icon-512.png'));
const MANIFEST = JSON.stringify({
  name: 'Админка кухни',
  short_name: 'Кухня',
  start_url: '/admin',
  scope: '/',
  display: 'standalone',
  background_color: '#fffaf5',
  theme_color: '#9a3412',
  lang: 'ru',
  icons: [
    { src: '/admin/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/admin/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
  ]
});
const SW = `'use strict';
self.addEventListener('install', event => {
  event.waitUntil(caches.open('kitchen-admin-1').then(cache => cache.addAll([
    '/admin',
    '/admin/manifest.webmanifest',
    '/admin/icon-192.png',
    '/admin/icon-512.png'
  ])));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
`;

const PAGE = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#9a3412">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Кухня">
  <link rel="manifest" href="/admin/manifest.webmanifest">
  <link rel="icon" href="/admin/icon-192.png">
  <link rel="apple-touch-icon" href="/admin/icon-192.png">
  <title>Админка · Кухонный</title>
  <style>
    body { margin: 0 auto; max-width: 880px; padding: max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom)); font: 16px/1.45 system-ui, sans-serif; background: #fffaf5; color: #1c1917; }
    h1 { font-size: 1.4rem; margin: 0 0 8px; }
    h2 { font-size: 1.05rem; margin: 0 0 8px; }
    .card { background: #fff; border: 1px solid #e7e5e4; border-radius: 14px; padding: 14px; margin: 12px 0; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
    input, button { font: inherit; }
    input { flex: 1; min-width: 140px; padding: 12px; border-radius: 10px; border: 1px solid #d6d3d1; }
    input[type="file"] { width: 100%; flex: none; }
    button { border: 0; border-radius: 10px; min-height: 48px; padding: 12px 14px; background: #9a3412; color: #fff; font-weight: 700; cursor: pointer; }
    .wrap { overflow-x: auto; }
    button.ghost { background: #fff; color: #1c1917; border: 1px solid #d6d3d1; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
    .stat { background: #fff7ed; border-radius: 12px; padding: 10px; }
    .stat b { display: block; font-size: 1.4rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #e7e5e4; vertical-align: top; }
    th { color: #78716c; font-size: 13px; }
    .bad { color: #be123c; }
    textarea, select { font: inherit; width: 100%; box-sizing: border-box; padding: 12px; border-radius: 10px; border: 1px solid #d6d3d1; margin: 8px 0; }
    textarea { min-height: 120px; }
    img.shot { width: 72px; height: 72px; object-fit: cover; border-radius: 8px; }
    .note { color: #57534e; }
    a { color: #9a3412; }
  </style>
</head>
<body>
  <h1>Админка кухни</h1>
  <p class="note" id="lead">Клиенты, общая база и то, чем поделились. На Android это же окно ставится как приложение.</p>
  <div class="card" id="login">
    <div class="row">
      <input id="pass" type="password" placeholder="Пароль администратора" autocomplete="current-password">
      <button type="button" id="enter">Войти</button>
    </div>
    <p id="err" class="bad"></p>
    <button type="button" id="install">Поставить на Android</button>
    <p class="note">В Chrome на телефоне нажмите «Поставить на Android» или меню браузера → «Установить приложение». На экране появится иконка «Кухня».</p>
  </div>
  <div id="app" style="display:none">
    <div class="row"><button type="button" class="ghost" id="out">Выйти</button><button type="button" id="install2">Поставить на Android</button></div>
    <div class="card"><h2>Сводка</h2><div class="grid" id="stats"></div><p class="note" id="engine"></p></div>
    <div class="card">
      <h2>Чёрный список</h2>
      <div class="row">
        <input id="userId" inputmode="numeric" placeholder="id ВК">
        <button type="button" id="addBan">В чёрный список</button>
      </div>
      <p id="userMsg" class="note">Бот перестанет отвечать этому id. Убрать из списка можно в карточке человека.</p>
      <div class="row"><input id="q" placeholder="Имя или id"><button type="button" id="find">Найти</button></div>
      <div class="wrap"><table><thead><tr><th>Человек</th><th>Сообщения</th><th>Рецепты</th><th>Был</th></tr></thead><tbody id="people"></tbody></table></div>
    </div>
    <div class="card" id="card" style="display:none"></div>
    <div class="card">
      <h2>Рецепт с фото</h2>
      <input id="recipeTitle" placeholder="Название, например борщ">
      <select id="recipeShelf"><option value="">Без полки</option>${shelfOptions()}</select>
      <textarea id="recipeText" placeholder="Ингредиенты и шаги. Так текст уйдёт в чат."></textarea>
      <input id="recipePhoto" type="file" accept="image/jpeg,image/png,image/webp">
      <div class="row"><button type="button" id="saveRecipe">Сохранить в базу</button></div>
      <p id="recipeMsg" class="note"></p>
      <h2>Общая база</h2>
      <div class="wrap"><table><thead><tr><th>Фото</th><th>Рецепт</th><th>Полка</th><th>Откуда</th></tr></thead><tbody id="base"></tbody></table></div>
    </div>
    <div class="card"><h2>Поделились</h2><div class="wrap"><table><thead><tr><th>Рецепт</th><th>Кто</th><th>Где</th></tr></thead><tbody id="shared"></tbody></table></div></div>
  </div>
  <script>
    let token = sessionStorage.getItem('kb_admin') || '';
    const $ = id => document.getElementById(id);
    async function api(path, options) {
      const opts = Object.assign({}, options || {});
      const form = Boolean(opts.form);
      delete opts.form;
      const headers = Object.assign({ Authorization: 'Bearer ' + token }, opts.headers || {});
      if (!form) headers['Content-Type'] = 'application/json';
      opts.headers = headers;
      const res = await fetch(path, opts);
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
        ['В ЧС', stats.blocked]
      ];
      $('stats').innerHTML = cells.map(item => '<div class="stat"><b>' + item[1] + '</b>' + item[0] + '</div>').join('');
      $('engine').textContent = stats.engine === 'postgres' ? 'Память: PostgreSQL.' : 'Память: файл на сервере. Чтобы карточки переживали деплой, соедините Postgres и переменную DATABASE_URL.';
      await search();
      const catalog = await api('/api/admin/catalog');
      const lines = [];
      for (const row of catalog.rows || []) {
        let pic = '';
        if (row.hasPhoto && row.id) {
          try {
            const shot = await fetch('/api/admin/recipe-photo?id=' + encodeURIComponent(row.id), { headers: { Authorization: 'Bearer ' + token } });
            if (shot.ok) pic = '<img class="shot" alt="" src="' + URL.createObjectURL(await shot.blob()) + '">';
          } catch (error) {}
        }
        lines.push('<tr><td>' + pic + '</td><td>' + escapeHtml(row.title) + '</td><td>' + escapeHtml(row.shelf || '') + '</td><td>' + (row.source === 'own' ? 'свой' : 'бот') + '</td></tr>');
      }
      $('base').innerHTML = lines.join('') || '<tr><td colspan="4">В общей базе пока пусто.</td></tr>';
      const shared = await api('/api/admin/shared');
      $('shared').innerHTML = (shared.rows || []).map(row => '<tr><td>' + escapeHtml(row.title) + '</td><td>' + escapeHtml(row.name || row.userId) + '</td><td>' + (row.status === 'posted' ? 'на стене' : 'сохранено') + '</td></tr>').join('') || '<tr><td colspan="3">Пока никто не делился.</td></tr>';
    }
    async function search() {
      const data = await api('/api/admin/clients?q=' + encodeURIComponent($('q').value || ''));
      $('people').innerHTML = (data.rows || []).map(row => '<tr><td><a href="#" data-id="' + row.userId + '">' + escapeHtml(row.name || row.username || row.userId) + '</a>' + (row.blocked ? ' · в ЧС' : '') + '</td><td>' + row.messages + '</td><td>' + row.recipes + '</td><td>' + when(row.lastSeen) + '</td></tr>').join('') || '<tr><td colspan="4">Пока никого нет. Напишите боту.</td></tr>';
    }
    async function openCard(id) {
      const data = await api('/api/admin/client?id=' + encodeURIComponent(id));
      const user = data.user;
      const fav = (data.favorites || []).map(escapeHtml).join(', ') || 'пусто';
      const log = (data.log || []).slice(0, 12).map(item => '<li>' + escapeHtml(item.kind) + (item.body ? ': ' + escapeHtml(item.body) : '') + '</li>').join('');
      $('card').style.display = 'block';
      $('card').innerHTML = '<h2>' + escapeHtml(user.name || user.userId) + '</h2><p class="note">id ' + escapeHtml(user.userId) + (user.username ? ' · ' + escapeHtml(user.username) : '') + (user.blocked ? '<br>В чёрном списке: бот не отвечает.' : '') + '<br>Сообщество: ' + escapeHtml(user.groupId || '—') + '<br>С ' + when(user.createdAt) + ', был ' + when(user.lastSeen) + '</p><p>Избранное: ' + fav + '</p><ul>' + log + '</ul><button type="button" id="block">' + (user.blocked ? 'Убрать из чёрного списка' : 'В чёрный список') + '</button>';
      $('block').onclick = async () => {
        await api('/api/admin/block', { method: 'POST', body: JSON.stringify({ userId: user.userId, blocked: !user.blocked }) });
        await openCard(id);
        await load();
      };
    }
    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }
    let installEvent = null;
    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      installEvent = event;
    });
    function install() {
      if (!installEvent) {
        alert('Откройте админку в Chrome на Android и в меню браузера выберите «Установить приложение».');
        return;
      }
      installEvent.prompt();
      installEvent = null;
    }
    $('install').onclick = install;
    $('install2').onclick = install;
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function () {});
    $('enter').onclick = login;
    async function addBan() {
      $('userMsg').textContent = '';
      const userId = ($('userId').value || '').replace(/\D/g, '');
      if (!userId) {
        $('userMsg').textContent = 'Напишите id ВК.';
        return;
      }
      try {
        await api('/api/admin/block', { method: 'POST', body: JSON.stringify({ userId: userId, blocked: true }) });
        $('userId').value = '';
        $('userMsg').textContent = 'id ' + userId + ' в чёрном списке. Бот ему не отвечает.';
        await load();
      } catch (error) {
        $('userMsg').textContent = error.message;
      }
    }
    async function saveRecipe() {
      $('recipeMsg').textContent = '';
      const file = $('recipePhoto').files && $('recipePhoto').files[0];
      if (!$('recipeTitle').value.trim() || !$('recipeText').value.trim()) {
        $('recipeMsg').textContent = 'Напишите название и текст рецепта.';
        return;
      }
      if (!file) {
        $('recipeMsg').textContent = 'Добавьте фотографию.';
        return;
      }
      const form = new FormData();
      form.append('title', $('recipeTitle').value.trim());
      form.append('category', $('recipeShelf').value);
      form.append('body', $('recipeText').value.trim());
      form.append('photo', file);
      try {
        await api('/api/admin/recipe', { method: 'POST', body: form, form: true });
        $('recipeTitle').value = '';
        $('recipeText').value = '';
        $('recipePhoto').value = '';
        $('recipeMsg').textContent = 'Рецепт с фото в общей базе. В чате он откроется вместе со снимком.';
        await load();
      } catch (error) {
        $('recipeMsg').textContent = error.message;
      }
    }
    $('find').onclick = () => search().catch(error => alert(error.message));
    $('addBan').onclick = () => addBan().catch(error => { $('userMsg').textContent = error.message; });
    $('saveRecipe').onclick = () => saveRecipe().catch(error => { $('recipeMsg').textContent = error.message; });
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

function readRaw(req, limit) {
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
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => reject(new Error('read')));
  });
}

function parseForm(buffer, header) {
  const found = String(header || '').match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!found) return null;
  const boundary = (found[1] || found[2] || '').trim();
  if (!boundary) return null;
  const sep = Buffer.from('--' + boundary);
  const parts = [];
  let start = buffer.indexOf(sep);
  if (start < 0) return null;
  start += sep.length;
  while (start < buffer.length) {
    if (buffer.slice(start, start + 2).toString() === '--') break;
    if (buffer.slice(start, start + 2).toString() === '\r\n') start += 2;
    const headEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), start);
    if (headEnd < 0) break;
    const head = buffer.slice(start, headEnd).toString('utf8');
    const name = /name="([^"]+)"/.exec(head);
    const mime = /Content-Type:\s*([^\r\n]+)/i.exec(head);
    const next = buffer.indexOf(sep, headEnd + 4);
    if (next < 0) break;
    let data = buffer.slice(headEnd + 4, next);
    if (data.length >= 2 && data[data.length - 2] === 13 && data[data.length - 1] === 10) data = data.slice(0, -2);
    parts.push({ name: name ? name[1] : '', mime: mime ? mime[1].trim() : '', data });
    start = next + sep.length;
  }
  return parts;
}

function formText(parts, name) {
  const part = (parts || []).find(item => item.name === name);
  return part ? part.data.toString('utf8').trim() : '';
}

function imageType(buf) {
  if (!buf || buf.length < 12) return '';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return '';
}

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

  function shelf(category) {
    const node = sectionById(category);
    return node ? (node.short || node.title) : '';
  }

  async function handle(req, res, url) {
    if (req.method === 'GET' && url.pathname === '/admin') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(PAGE);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/admin/manifest.webmanifest') {
      res.writeHead(200, { 'content-type': 'application/manifest+json; charset=utf-8' });
      res.end(MANIFEST);
      return true;
    }
    if (req.method === 'GET' && (url.pathname === '/admin/icon-192.png' || url.pathname === '/admin/icon-512.png')) {
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' });
      res.end(url.pathname.endsWith('512.png') ? ICON512 : ICON192);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/sw.js') {
      res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' });
      res.end(SW);
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
      } else if (url.pathname === '/api/admin/recipe' && req.method === 'POST') {
        let raw;
        try {
          raw = await readRaw(req, 2800000);
        } catch (error) {
          send(res, 400, { error: 'Фото больше 2,5 МБ. Уменьшите снимок и загрузите снова.' });
          return true;
        }
        const parts = parseForm(raw, req.headers['content-type']);
        const title = formText(parts, 'title').replace(/\s+/g, ' ').slice(0, 80);
        const category = formText(parts, 'category').replace(/[^\w-]/g, '').slice(0, 40);
        const text = formText(parts, 'body').slice(0, 4000);
        const file = (parts || []).find(item => item.name === 'photo' && item.data && item.data.length);
        const mime = file ? imageType(file.data) : '';
        if (!title || !text) {
          send(res, 400, { error: 'Напишите название и текст рецепта.' });
        } else if (!file || !mime || file.data.length > 2500000) {
          send(res, 400, { error: file && file.data.length > 2500000 ? 'Фото больше 2,5 МБ. Уменьшите снимок и загрузите снова.' : 'Нужна фотография JPEG, PNG или WEBP.' });
        } else {
          const owner = String(config.groupId || '1').replace(/\D/g, '') || '1';
          const saved = await db.saveCatalog(owner, {
            category: sectionById(category) ? category : '',
            title,
            query: title,
            body: text,
            source: 'own',
            photo: { bytes: file.data, mime }
          });
          send(res, 200, { id: saved && saved.id ? String(saved.id) : '', title });
        }
      } else if (url.pathname === '/api/admin/recipe-photo') {
        const photo = db.catalogPhoto ? await db.catalogPhoto(url.searchParams.get('id') || '') : null;
        if (!photo) send(res, 404, { error: 'Фото нет.' });
        else {
          res.writeHead(200, { 'content-type': photo.mime || 'image/jpeg', 'cache-control': 'private, max-age=3600' });
          res.end(photo.bytes);
        }
      } else if (url.pathname === '/api/admin/catalog') {
        const rows = db.listCatalog ? await db.listCatalog() : [];
        send(res, 200, {
          rows: (rows || []).map(row => ({
            id: row.id || '',
            title: row.title || 'Рецепт',
            shelf: shelf(row.category),
            source: row.source === 'own' ? 'own' : 'found',
            hasPhoto: Boolean(row.hasPhoto)
          }))
        });
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
