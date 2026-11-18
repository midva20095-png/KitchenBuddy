'use strict';

function appPage() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Поиск рецептов</title>
  <style>
    body { margin: 0; font-family: sans-serif; background: #fff7f0; color: #3b2416; }
    main { max-width: 420px; margin: 0 auto; padding: 28px 20px 40px; }
    h1 { font-size: 28px; line-height: 1.2; margin: 0 0 12px; }
    p { line-height: 1.45; margin: 0 0 16px; }
    button { width: 100%; border: 0; border-radius: 14px; padding: 16px; font: inherit; font-weight: 700; color: #fff; background: #c4512c; }
    button:disabled { opacity: 0.6; }
    #status { min-height: 3em; }
  </style>
</head>
<body>
  <main>
    <h1>Поиск рецептов</h1>
    <p>Приложение в списке — это ещё не кнопка. Нажмите ниже и подтвердите окно ВК. После этого вверху сообщества появится широкая кнопка «Поиск рецептов», она открывает чат с ботом.</p>
    <button id="pin" type="button">Поставить на страницу</button>
    <p id="status">Откройте приложение со страницы сообщества на компьютере, не из кабинета разработчика.</p>
  </main>
  <script>
    function vkSend(handler, params) {
      var packet = { handler: handler, params: params || {}, type: 'vk-connect', connectVersion: '2.15.8', sendTime: Date.now() };
      try { parent.postMessage(packet, '*'); } catch (error) {}
    }
    vkSend('VKWebAppInit');
    var query = new URLSearchParams(location.search);
    var groupId = String(query.get('vk_group_id') || '').replace(/\\D/g, '');
    var appId = String(query.get('vk_app_id') || '').replace(/\\D/g, '');
    var waitToken = null;
    function say(text) { document.getElementById('status').textContent = text; }
    window.addEventListener('message', function (event) {
      var data = event.data || {};
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (error) { data = {}; }
      }
      var type = (data.data && data.data.type) || (data.detail && data.detail.type) || data.type || '';
      var bag = (data.data && data.data.data) || (data.detail && data.detail.data) || data.data || {};
      if (type === 'VKWebAppGetCommunityTokenResult' && bag.access_token && waitToken) {
        var done = waitToken;
        waitToken = null;
        done(bag.access_token);
      }
      if (type === 'VKWebAppGetCommunityTokenFailed') {
        waitToken = null;
        say('Разрешение не выдано. Подтвердите окно ВК.');
        document.getElementById('pin').disabled = false;
      }
      if (String(type).indexOf('WidgetPreviewBoxResult') >= 0) {
        say('Кнопка поставлена. Обновите страницу сообщества: вверху будет «Поиск рецептов».');
      }
      if (String(type).indexOf('WidgetPreviewBoxFailed') >= 0) {
        say('ВК не открыл окно кнопки. Откройте приложение ещё раз со страницы сообщества.');
        document.getElementById('pin').disabled = false;
      }
    });
    document.getElementById('pin').addEventListener('click', function () {
      var button = document.getElementById('pin');
      if (!groupId || !appId) {
        say('Откройте приложение из сообщества KitchenBuddy на компьютере. В обычной вкладке кнопка не ставится.');
        return;
      }
      button.disabled = true;
      say('Жду разрешение ВК…');
      var tokenWait = new Promise(function (resolve) { waitToken = resolve; });
      vkSend('VKWebAppGetCommunityToken', { app_id: Number(appId), group_id: Number(groupId), scope: 'app_widget' });
      tokenWait.then(function (token) {
        return fetch('/api/app/pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token, groupId: groupId })
        });
      }).then(function (res) {
        return res.json().then(function (body) { return { ok: res.ok, body: body }; });
      }).then(function (result) {
        if (result.ok && result.body && result.body.code) {
          vkSend('VKWebAppShowCommunityWidgetPreviewBox', {
            group_id: Number(groupId),
            type: 'cover_list',
            code: result.body.code
          });
          say('Подтвердите кнопку в окне ВК. Затем обновите страницу сообщества.');
          return;
        }
        say(result.ok ? 'Кнопка «Поиск рецептов» стоит на странице и открывает чат с ботом.' : ((result.body && result.body.error) || 'Кнопку не удалось поставить.'));
      }).catch(function () {
        say('Кнопку не удалось поставить.');
      }).then(function () { button.disabled = false; });
    });
  </script>
</body>
</html>`;
}

module.exports = { appPage };
