'use strict';

require('dotenv').config();

const path = require('path');
const { loadConfig } = require('./src/config');
const { loadLessons } = require('./src/lessons');
const { createStore } = require('./src/store');
const { createClients } = require('./src/clients');
const { createGigaChat } = require('./src/gigachat');
const { createVk } = require('./src/vk');
const { createBot } = require('./src/bot');
const { startPoll } = require('./src/poll');
const { placeSearchButton } = require('./src/widget');
const { startServer } = require('./src/server');

const config = loadConfig();
const state = {
  vkOnline: false,
  vkHint: config.tokenConfigured ? 'Подключаюсь к сообществу.' : 'Не задан ключ сообщества.',
  communityName: config.communityName,
  clients: 'открываю',
  startedAt: new Date().toISOString()
};

const giga = createGigaChat({ env: process.env });
const vk = config.token ? createVk({ token: config.token, groupId: config.groupId }) : null;
const lessons = loadLessons(path.join(config.dataDir, 'lessons.json'));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function openStore() {
  const url = String(process.env.DATABASE_URL || '').trim();
  if (!url) {
    state.clients = 'файл: DATABASE_URL не задан';
    console.log('DATABASE_URL не задан. Клиенты пишутся в файл и сотрутся при деплое.');
    return createStore(config.dataDir);
  }
  const db = createClients(url);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const count = await db.init();
      state.clients = `PostgreSQL, клиентов ${count}`;
      console.log(`База клиентов PostgreSQL готова. Клиентов: ${count}.`);
      return db;
    } catch (error) {
      const code = error && error.code ? ` (${error.code})` : '';
      console.error(`База клиентов не открылась${code}, попытка ${attempt}.`);
      await sleep(2000);
    }
  }
  state.clients = 'файл: база не открылась';
  console.error('База клиентов недоступна. Пока пишу диалоги в файл.');
  try { await db.close(); } catch (error) {}
  return createStore(config.dataDir);
}

function startBot(store) {
  const bot = createBot({
    store,
    giga,
    config,
    lessons,
    profile: vk ? userId => vk.profile(userId) : null,
    member: vk && config.subscribersOnly ? userId => vk.isMember(userId) : null,
    send: (peer, text, keyboard) => (vk ? vk.send(peer, text, keyboard) : Promise.resolve()),
    comment: (input, text) => (vk ? vk.comment(input, text) : Promise.resolve()),
    post: text => (vk ? vk.post(text) : Promise.reject(new Error('no-vk'))),
    typing: peer => (vk ? vk.typing(peer) : Promise.resolve())
  });
  if (!vk) {
    console.log('VK_GROUP_TOKEN не задан. HTTP жив, к сообществу не подключаюсь.');
    return;
  }
  startPoll({ vk, bot, config, state, placeButton: placeSearchButton }).catch(error => {
    console.error('ВК остановился.');
    state.vkOnline = false;
    state.vkHint = error && error.message ? 'Нет связи с ВКонтакте.' : 'Нет связи с ВКонтакте.';
  });
}

const holder = { store: null };
const server = startServer({ config, state, holder });
console.log(`Кухонный помощник слушает порт ${config.port}.`);
if (!config.gigaConfigured) console.log('GIGACHAT_AUTH_KEY не задан. Рецепты появятся, когда ключ будет в переменных.');
openStore().then(store => {
  holder.store = store;
  startBot(store);
}).catch(error => {
  console.error('Хранилище не запустилось.');
  state.clients = 'файл: база не открылась';
  const file = createStore(config.dataDir);
  holder.store = file;
  startBot(file);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
