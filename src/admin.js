'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { sectionById, sectionIds } = require('./menu');
const { broadcast } = require('./mail');

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
  background_color: '#05060a',
  theme_color: '#39f3ff',
  lang: 'ru',
  icons: [
    { src: '/admin/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/admin/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
  ]
});
const SW = `'use strict';
self.addEventListener('install', event => {
  event.waitUntil(caches.open('kitchen-admin-2').then(cache => cache.addAll([
    '/admin',
    '/admin/manifest.webmanifest',
    '/admin/icon-192.png',
    '/admin/icon-512.png'
  ])));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== 'kitchen-admin-2').map(key => caches.delete(key)))).then(() => self.clients.claim()));
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
  <meta name="theme-color" content="#05060a">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Кухня">
  <link rel="manifest" href="/admin/manifest.webmanifest">
  <link rel="icon" href="/admin/icon-192.png">
  <link rel="apple-touch-icon" href="/admin/icon-192.png">
  <title>Админка · Кухонный</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0 auto; max-width: 980px; padding: max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom)); font: 16px/1.45 system-ui, sans-serif; background: #05060a; color: #d9fff6; }
    h1 { font-size: 1.6rem; margin: 0 0 8px; color: #39f3ff; animation: neon 2.8s ease-in-out infinite; }
    h1::after { content: ''; display: block; height: 2px; margin-top: 8px; background: linear-gradient(90deg, transparent, #39f3ff, #ff4df0, #c6ff4a, transparent); background-size: 200% 100%; animation: slide 3.2s linear infinite; }
    h2 { font-size: 1.05rem; margin: 0 0 8px; color: #ff4df0; text-shadow: 0 0 10px rgba(255, 77, 240, .55); }
    @keyframes neon { 0%, 100% { text-shadow: 0 0 6px #39f3ff, 0 0 18px #167f88; } 50% { text-shadow: 0 0 10px #ff4df0, 0 0 26px #39f3ff; } }
    @keyframes slide { to { background-position: 200% 0; } }
    .card { background: #0b0e14; border: 1px solid #16424a; border-radius: 14px; padding: 14px; margin: 12px 0; box-shadow: 0 0 18px rgba(57, 243, 255, .08); }
    .row, .nav { display: flex; gap: 8px; flex-wrap: wrap; }
    input, button, textarea, select { font: inherit; }
    input { flex: 1; min-width: 140px; padding: 12px; border-radius: 10px; border: 1px solid #1d4d56; background: #07090d; color: #eafffb; }
    input[type="file"] { width: 100%; flex: none; }
    button { border: 1px solid #39f3ff; border-radius: 10px; min-height: 48px; padding: 12px 14px; background: transparent; color: #39f3ff; font-weight: 700; cursor: pointer; }
    button.mini { min-height: 36px; padding: 6px 10px; }
    button.on, button.solid { background: #39f3ff; color: #041014; box-shadow: 0 0 16px #39f3ff; }
    .wrap { overflow-x: auto; }
    button.ghost { background: transparent; color: #c6ff4a; border-color: #c6ff4a; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
    .stat { background: #07090d; border: 1px solid #16424a; border-radius: 12px; padding: 10px; }
    .stat b { display: block; font-size: 1.4rem; color: #c6ff4a; animation: neon 3.4s ease-in-out infinite; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #16343a; vertical-align: middle; }
    th { color: #7dfff0; font-size: 13px; }
    .id { font-family: ui-monospace, monospace; color: #39f3ff; }
    .bad { color: #ff5d7a; }
    textarea, select { width: 100%; box-sizing: border-box; padding: 12px; border-radius: 10px; border: 1px solid #1d4d56; margin: 8px 0; background: #07090d; color: #eafffb; }
    textarea { min-height: 120px; }
    img.shot { width: 72px; height: 72px; object-fit: cover; border-radius: 8px; }
    .note { color: #9ad7cf; }
    a { color: #39f3ff; }
    .panel { display: none; }
    .panel.on { display: block; }
  </style>
</head>
<body>
  <h1>Админка кухни</h1>
  <p class="note" id="lead">Разделы: сводка, подписчики, чёрный список, рассылка, рецепты. На Android это же окно ставится как приложение.</p>
  <div class="card" id="login">
    <div class="row">
      <input id="pass" type="password" placeholder="Пароль администратора" autocomplete="current-password">
      <button type="button" class="solid" id="enter">Войти</button>
    </div>
    <p id="err" class="bad"></p>
    <button type="button" id="install">Поставить на Android</button>
    <p class="note">В Chrome на телефоне нажмите «Поставить на Android» или меню браузера → «Установить приложение». На экране появится иконка «Кухня».</p>
  </div>
  <div id="app" style="display:none">
    <div class="row"><button type="button" class="ghost" id="out">Выйти</button><button type="button" id="install2">Поставить на Android</button></div>
    <nav class="nav">
      <button type="button" class="on" data-tab="home">Сводка</button>
      <button type="button" data-tab="people">Подписчики</button>
      <button type="button" data-tab="ban">Чёрный список</button>
      <button type="button" data-tab="mail">Рассылка</button>
      <button type="button" data-tab="recipes">Рецепты</button>
      <button type="button" data-tab="shared">Поделились</button>
    </nav>
    <div class="card" id="card" style="display:none"></div>
    <section class="panel on" id="home">
      <div class="card"><h2>Сводка</h2><div class="grid" id="stats"></div><p class="note" id="engine"></p></div>
      <div class="card">
        <h2>Кнопка в боте</h2>
        <p class="note" id="listNote">Список по разделам — общая книга. Рецепты туда попадают из разделов, которые заводят люди.</p>
        <button type="button" id="toggleList">Скрыть список по разделам</button>
      </div>
    </section>
    <section class="panel" id="people">
      <div class="card">
        <h2>Подписчики</h2>
        <p class="note">Кто зашёл в бота. У каждого виден id. Кнопка в строке добавляет в чёрный список или убирает из него.</p>
        <div class="row"><input id="q" placeholder="Имя или id"><button type="button" id="find">Найти</button><button type="button" class="ghost" id="onlyMembers">Только подписчики</button></div>
        <div class="wrap"><table><thead><tr><th>Человек</th><th>id</th><th>Подписка</th><th>Сообщения</th><th>Рецепты</th><th>Был</th><th></th></tr></thead><tbody id="peopleRows"></tbody></table></div>
      </div>
    </section>
    <section class="panel" id="ban">
      <div class="card">
        <h2>Чёрный список</h2>
        <div class="row">
          <input id="userId" inputmode="numeric" placeholder="id ВК">
          <button type="button" id="addBan">В чёрный список</button>
        </div>
        <p id="userMsg" class="note">Впишите id и нажмите кнопку. Бот перестанет отвечать. Убрать можно здесь же или в списке подписчиков.</p>
        <div class="wrap"><table><thead><tr><th>Человек</th><th>id</th><th>Подписка</th><th>Сообщения</th><th>Рецепты</th><th>Был</th><th></th></tr></thead><tbody id="banned"></tbody></table></div>
      </div>
    </section>
    <section class="panel" id="mail">
      <div class="card">
        <h2>Рассылка</h2>
        <p class="note">Сообщение уходит только тем, кто подписан на сообщество и уже писал боту. Без подписки рассылки нет. Если человек закрыл личные сообщения, бот выбрасывает его и больше не пишет, пока он сам снова не напишет.</p>
        <textarea id="mailText" placeholder="Текст рассылки"></textarea>
        <div class="row"><button type="button" class="solid" id="sendMail">Отправить подписчикам</button></div>
        <p id="mailMsg" class="note"></p>
      </div>
    </section>
    <section class="panel" id="recipes">
      <div class="card">
        <h2>Рецепт с фото</h2>
        <input id="recipeTitle" placeholder="Название, например борщ">
        <select id="recipeShelf"><option value="">Без полки</option>${shelfOptions()}</select>
        <textarea id="recipeText" placeholder="Ингредиенты и шаги. Так текст уйдёт в чат."></textarea>
        <input id="recipePhoto" type="file" accept="image/jpeg,image/png,image/webp">
        <div class="row"><button type="button" class="solid" id="saveRecipe">Сохранить в базу</button></div>
        <p id="recipeMsg" class="note"></p>
        <h2>Общая база</h2>
        <div class="wrap"><table><thead><tr><th>Фото</th><th>Рецепт</th><th>Полка</th><th>Откуда</th></tr></thead><tbody id="base"></tbody></table></div>
      </div>
    </section>
    <section class="panel" id="shared">
      <div class="card"><h2>Поделились</h2><div class="wrap"><table><thead><tr><th>Рецепт</th><th>Кто</th><th>Где</th></tr></thead><tbody id="sharedRows"></tbody></table></div></div>
    </section>
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
    let everyone = [];
    let membersOnly = false;
    let publicSections = true;
    function paintList() {
      $('toggleList').textContent = publicSections ? 'Скрыть список по разделам' : 'Включить список по разделам';
      $('listNote').textContent = publicSections
        ? 'Кнопка «Список по разделам» видна в боте. Рецепты из разделов личных книг доступны всем кнопками.'
        : 'Кнопка «Список по разделам» скрыта. В боте её нет, пока вы снова не включите.';
    }
    async function load() {
      const pack = await api('/api/admin/stats');
      const stats = pack.stats || {};
      const cells = [
        ['Клиенты', stats.clients],
        ['Сегодня', stats.newDay],
        ['Были сегодня', stats.activeDay],
        ['Подписчики', stats.members || 0],
        ['Без подписки', stats.guests || 0],
        ['Получат рассылку', stats.ready || 0],
        ['Личка закрыта', stats.closed || 0],
        ['Рецепты', stats.recipes],
        ['Поделились', stats.shared],
        ['В ЧС', stats.blocked]
      ];
      $('stats').innerHTML = cells.map(item => '<div class="stat"><b>' + item[1] + '</b>' + item[0] + '</div>').join('');
      $('engine').textContent = stats.engine === 'postgres'
        ? 'Память: PostgreSQL. Рассылка только подписчикам сообщества, которые писали боту.'
        : 'Память: файл на сервере. Рассылка только подписчикам сообщества, которые писали боту.';
      const settings = await api('/api/admin/settings');
      publicSections = settings.publicSections !== false;
      paintList();
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
      $('sharedRows').innerHTML = (shared.rows || []).map(row => '<tr><td>' + escapeHtml(row.title) + '</td><td>' + escapeHtml(row.name || row.userId) + '</td><td>' + (row.status === 'posted' ? 'на стене' : 'сохранено') + '</td></tr>').join('') || '<tr><td colspan="3">Пока никто не делился.</td></tr>';
    }
    function subText(member) {
      if (member === true) return 'подписчик';
      if (member === false) return 'без подписки';
      return 'не проверена';
    }
    function personLine(row) {
      const action = row.blocked
        ? '<button type="button" class="mini ghost" data-free="' + row.userId + '">Убрать из ЧС</button>'
        : '<button type="button" class="mini" data-ban="' + row.userId + '">В чёрный список</button>';
      const state = row.blocked ? 'в ЧС' : (row.dmClosed ? 'личка закрыта' : '');
      return '<tr><td><a href="#" data-id="' + row.userId + '">' + escapeHtml(row.name || row.username || 'без имени') + '</a>' + (state ? ' · ' + state : '') + '</td><td class="id">' + escapeHtml(row.userId) + '</td><td>' + subText(row.member) + '</td><td>' + row.messages + '</td><td>' + row.recipes + '</td><td>' + when(row.lastSeen) + '</td><td>' + action + '</td></tr>';
    }
    function paintPeople() {
      const needle = ($('q').value || '').trim().toLowerCase();
      const rows = everyone.filter(row => {
        if (membersOnly && row.member !== true) return false;
        if (!needle) return true;
        return (row.name + ' ' + row.username + ' ' + row.userId).toLowerCase().includes(needle);
      });
      $('peopleRows').innerHTML = rows.map(personLine).join('') || '<tr><td colspan="7">Пока никого нет. Напишите боту.</td></tr>';
      const banned = everyone.filter(row => row.blocked);
      $('banned').innerHTML = banned.map(personLine).join('') || '<tr><td colspan="7">Чёрный список пуст.</td></tr>';
    }
    async function search() {
      const data = await api('/api/admin/clients?q=');
      everyone = data.rows || [];
      paintPeople();
    }
    async function openCard(id) {
      const data = await api('/api/admin/client?id=' + encodeURIComponent(id));
      const user = data.user;
      const fav = (data.favorites || []).map(escapeHtml).join(', ') || 'пусто';
      const log = (data.log || []).slice(0, 12).map(item => '<li>' + escapeHtml(item.kind) + (item.body ? ': ' + escapeHtml(item.body) : '') + '</li>').join('');
      const sub = subText(user.member);
      $('card').style.display = 'block';
      $('card').innerHTML = '<h2>' + escapeHtml(user.name || user.userId) + '</h2><p class="note">id ' + escapeHtml(user.userId) + (user.username ? ' · ' + escapeHtml(user.username) : '') + '<br>Подписка: ' + sub + (user.blocked ? '<br>В чёрном списке: бот не отвечает.' : '') + (user.dmClosed ? '<br>Личка закрыта: бот выбросил человека, пока он сам не напишет.' : '') + '<br>Сообщество: ' + escapeHtml(user.groupId || '—') + '<br>С ' + when(user.createdAt) + ', был ' + when(user.lastSeen) + '</p><p>Избранное: ' + fav + '</p><ul>' + log + '</ul><button type="button" id="block">' + (user.blocked ? 'Убрать из чёрного списка' : 'В чёрный список') + '</button>';
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
    $('toggleList').onclick = async () => {
      try {
        const data = await api('/api/admin/settings', { method: 'POST', body: JSON.stringify({ publicSections: !publicSections }) });
        publicSections = data.publicSections !== false;
        paintList();
      } catch (error) {
        alert(error.message);
      }
    };
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
    $('find').onclick = () => paintPeople();
    $('onlyMembers').onclick = () => {
      membersOnly = !membersOnly;
      $('onlyMembers').classList.toggle('on', membersOnly);
      paintPeople();
    };
    document.querySelector('.nav').onclick = event => {
      const button = event.target.closest('[data-tab]');
      if (!button) return;
      const tab = button.getAttribute('data-tab');
      document.querySelectorAll('.panel').forEach(node => node.classList.toggle('on', node.id === tab));
      document.querySelectorAll('.nav button').forEach(node => node.classList.toggle('on', node.getAttribute('data-tab') === tab));
    };
    $('app').onclick = event => {
      const ban = event.target.closest('[data-ban]');
      const free = event.target.closest('[data-free]');
      const link = event.target.closest('a[data-id]');
      if (ban) {
        event.preventDefault();
        api('/api/admin/block', { method: 'POST', body: JSON.stringify({ userId: ban.getAttribute('data-ban'), blocked: true }) }).then(() => load()).catch(error => alert(error.message));
        return;
      }
      if (free) {
        event.preventDefault();
        api('/api/admin/block', { method: 'POST', body: JSON.stringify({ userId: free.getAttribute('data-free'), blocked: false }) }).then(() => load()).catch(error => alert(error.message));
        return;
      }
      if (!link) return;
      event.preventDefault();
      openCard(link.getAttribute('data-id')).catch(error => alert(error.message));
    };
    async function sendMail() {
      $('mailMsg').textContent = '';
      const text = ($('mailText').value || '').trim();
      if (!text) {
        $('mailMsg').textContent = 'Напишите текст рассылки.';
        return;
      }
      try {
        $('mailMsg').textContent = 'Отправляю подписчикам...';
        const data = await api('/api/admin/broadcast', { method: 'POST', body: JSON.stringify({ text }) });
        $('mailMsg').textContent = 'Ушло: ' + data.sent + '. Пропущено: ' + data.skipped + '. Выброшены из бота, личка закрыта: ' + data.thrown + '. Не ушло: ' + data.failed + '.';
        await load();
      } catch (error) {
        $('mailMsg').textContent = error.message;
      }
    }
    $('addBan').onclick = () => addBan().catch(error => { $('userMsg').textContent = error.message; });
    $('saveRecipe').onclick = () => saveRecipe().catch(error => { $('recipeMsg').textContent = error.message; });
    $('sendMail').onclick = () => sendMail();
    $('out').onclick = () => { sessionStorage.removeItem('kb_admin'); location.reload(); };
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
      } else if (url.pathname === '/api/admin/settings' && req.method === 'GET') {
        const settings = db.getSettings ? await db.getSettings() : { publicSections: true };
        send(res, 200, settings);
      } else if (url.pathname === '/api/admin/settings' && req.method === 'POST') {
        const body = await readBody(req);
        const settings = db.setSettings
          ? await db.setSettings({ publicSections: Boolean(body.publicSections) })
          : { publicSections: Boolean(body.publicSections) };
        send(res, 200, settings);
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
      } else if (url.pathname === '/api/admin/broadcast' && req.method === 'POST') {
        const body = await readBody(req);
        try {
          const result = await broadcast({
            store: db,
            send: holder.send,
            member: holder.member,
            text: body.text,
            pause: holder.mailPause || 0
          });
          send(res, 200, result);
        } catch (error) {
          const status = error && error.status;
          if (status === 400) send(res, 400, { error: 'Напишите текст рассылки.' });
          else if (status === 503) send(res, 503, { error: 'Бот ещё не подключён к сообществу. Рассылка заработает после подключения.' });
          else throw error;
        }
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
