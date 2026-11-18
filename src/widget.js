'use strict';

const fs = require('fs');
const path = require('path');

const COVER = path.join(__dirname, '..', 'assets', 'search-recipes.jpg');

function chatLink(groupId) {
  const id = String(groupId || '').replace(/\D/g, '');
  return id ? `https://vk.com/write-${id}` : '';
}

function widgetCode(groupId, coverId) {
  const url = chatLink(groupId);
  if (!url) throw new Error('Нет номера сообщества.');
  if (!/^-?\d+_\d+$/.test(String(coverId || ''))) throw new Error('Нет картинки для кнопки.');
  const rows = [{
    title: 'Поиск рецептов',
    title_url: url,
    button: 'Написать',
    cover_id: String(coverId),
    url,
    button_url: url
  }];
  return `return ${JSON.stringify({ title: 'Поиск рецептов', rows })};`;
}

function uploadFields(raw) {
  let payload = {};
  try { payload = JSON.parse(String(raw || '')); } catch (error) { payload = {}; }
  return {
    hash: String(payload.hash || ''),
    image: payload.image ? String(payload.image) : Buffer.from(String(raw || '')).toString('base64')
  };
}

function failText(error) {
  const code = Number(error && (error.code || error.error_code || error.vkCode));
  if (code === 15 || code === 27 || code === 28) {
    return 'Ключ сообщений не ставит эту кнопку. Откройте мини-приложение KitchenBuddy из сообщества на компьютере и нажмите «Поставить на страницу».';
  }
  if (code === 100 || code === 129) return 'ВК не принял картинку или ссылку кнопки.';
  return 'Кнопку «Поиск рецептов» не удалось поставить.';
}

async function uploadCover(token, jpeg) {
  const access = String(token || '').trim();
  const params = new URLSearchParams({ access_token: access, v: '5.199', image_type: '510x128' });
  const serverRes = await fetch(`https://api.vk.com/method/appWidgets.getGroupImageUploadServer?${params}`);
  const serverJson = await serverRes.json();
  const uploadUrl = serverJson.response && serverJson.response.upload_url;
  if (!uploadUrl) {
    const error = new Error(failText(serverJson.error));
    error.code = serverJson.error && serverJson.error.error_code;
    throw error;
  }
  const form = new FormData();
  form.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'cover.jpg');
  const uploaded = await fetch(uploadUrl, { method: 'POST', body: form });
  const fields = uploadFields(await uploaded.text());
  const save = new URLSearchParams({
    access_token: access,
    v: '5.199',
    hash: fields.hash,
    image: fields.image
  });
  const savedRes = await fetch('https://api.vk.com/method/appWidgets.saveGroupImage', { method: 'POST', body: save });
  const saved = await savedRes.json();
  const id = saved.response && saved.response.id;
  if (!id) {
    const error = new Error(failText(saved.error));
    error.code = saved.error && saved.error.error_code;
    throw error;
  }
  return String(id);
}

async function publishCover(token, code) {
  const body = new URLSearchParams({
    access_token: String(token || '').trim(),
    v: '5.199',
    type: 'cover_list',
    code: String(code || '')
  });
  const res = await fetch('https://api.vk.com/method/appWidgets.update', { method: 'POST', body });
  const json = await res.json();
  if (!json.response) {
    const error = new Error(failText(json.error));
    error.code = json.error && json.error.error_code;
    throw error;
  }
  return true;
}

async function pinSearchButton(token, groupId) {
  const access = String(token || '').trim();
  const id = String(groupId || '').replace(/\D/g, '');
  if (access.length < 20 || !id) throw new Error('ВК не выдал разрешение на кнопку.');
  const jpeg = await fs.promises.readFile(COVER);
  const coverId = await uploadCover(access, jpeg);
  const code = widgetCode(id, coverId);
  try {
    await publishCover(access, code);
    console.log(`Кнопка «Поиск рецептов» стоит на странице сообщества и ведёт в чат ${chatLink(id)}.`);
  } catch (error) {
    const text = String((error && error.message) || 'не встала').replace(/access_token=[^&\s]+/g, '');
    console.error(`Кнопка через ключ не встала: ${text}. Жду подтверждение в окне ВК.`);
  }
  return { code };
}

async function placeSearchButton(vk) {
  const groupId = vk && vk.groupId;
  const token = String(process.env.VK_WIDGET_TOKEN || '').trim();
  if (!groupId || token.length < 20) {
    console.log('Кнопка «Поиск рецептов» ставится из мини-приложения KitchenBuddy: откройте его в сообществе на компьютере и нажмите «Поставить на страницу».');
    return false;
  }
  return pinSearchButton(token, groupId);
}

module.exports = { chatLink, widgetCode, uploadFields, placeSearchButton, pinSearchButton, failText };
