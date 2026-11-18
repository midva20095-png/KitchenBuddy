'use strict';

require('dotenv').config();

const path = require('path');
const { loadConfig } = require('./src/config');
const { loadLessons } = require('./src/lessons');
const { createStore } = require('./src/store');
const { createGigaChat } = require('./src/gigachat');
const { createVk } = require('./src/vk');
const { createBot } = require('./src/bot');
const { startPoll } = require('./src/poll');
const { startServer } = require('./src/server');

const config = loadConfig();
const state = {
  vkOnline: false,
  vkHint: config.tokenConfigured ? 'Подключаюсь к сообществу.' : 'Не задан ключ сообщества.',
  communityName: config.communityName,
  startedAt: new Date().toISOString()
};

const store = createStore(config.dataDir);
const giga = createGigaChat({ env: process.env });
const vk = config.token ? createVk({ token: config.token, groupId: config.groupId }) : null;
const lessons = loadLessons(path.join(config.dataDir, 'lessons.json'));
const bot = createBot({
  store,
  giga,
  config,
  lessons,
  member: vk && config.subscribersOnly ? userId => vk.isMember(userId) : null,
  send: (peer, text, keyboard) => (vk ? vk.send(peer, text, keyboard) : Promise.resolve()),
  comment: (input, text) => (vk ? vk.comment(input, text) : Promise.resolve()),
  typing: peer => (vk ? vk.typing(peer) : Promise.resolve())
});

const server = startServer({ config, state });
console.log(`Кухонный помощник слушает порт ${config.port}.`);
if (!config.gigaConfigured) console.log('GIGACHAT_AUTH_KEY не задан. Рецепты появятся, когда ключ будет в переменных.');

if (!vk) {
  console.log('VK_GROUP_TOKEN не задан. HTTP жив, к сообществу не подключаюсь.');
} else {
  startPoll({ vk, bot, config, state }).catch(error => {
    console.error('ВК остановился.');
    state.vkOnline = false;
    state.vkHint = error && error.message ? 'Нет связи с ВКонтакте.' : 'Нет связи с ВКонтакте.';
  });
}

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
