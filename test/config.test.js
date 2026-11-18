'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config');

test('настройки читают числа и не тащат секреты в объект для страницы', () => {
  const config = loadConfig({
    PORT: '3000',
    VK_GROUP_ID: 'club214',
    VK_GROUP_TOKEN: 'secret-token',
    VK_SCREEN_NAME: 'kitchen_buddy',
    VK_COMMUNITY_NAME: 'Тестовая кухня',
    GIGACHAT_AUTH_KEY: 'secret-key',
    GIGACHAT_DAILY_LIMIT: '15',
    WALL_REPLIES: '0',
    CHAT_REPLIES: '1',
    WALL_HOUR_LIMIT: '0',
    DATA_DIR: 'tmp-data'
  });
  assert.equal(config.port, 3000);
  assert.equal(config.groupId, '214');
  assert.equal(config.token, 'secret-token');
  assert.equal(config.screenName, 'kitchen_buddy');
  assert.equal(config.communityName, 'Тестовая кухня');
  assert.equal(config.gigaConfigured, true);
  assert.equal(config.dailyLimit, 15);
  assert.equal(config.wallReplies, false);
  assert.equal(config.chatReplies, true);
  assert.equal(config.wallHourLimit, 0);
  assert.equal(config.subscribersOnly, true);
  assert.equal(config.sourceGroupId, '213938339');
  assert.equal(loadConfig({ SOURCE_GROUP_ID: 'club213938339' }).sourceGroupId, '213938339');
  assert.equal(loadConfig({ SOURCE_GROUP_ID: '0' }).sourceGroupId, '');
  assert.equal(config.sourceTokenConfigured, false);
  assert.equal(loadConfig({ SOURCE_GROUP_TOKEN: 'vk1.a.secret' }).sourceTokenConfigured, true);
  assert.equal(loadConfig({ SUBSCRIBERS_ONLY: '0' }).subscribersOnly, false);
  assert.equal(Object.hasOwn(config, 'gigaKey'), false);
  const broken = loadConfig({
    GIGACHAT_DAILY_LIMIT: '-1',
    VK_SCREEN_NAME: 'кухня',
    WALL_HOUR_LIMIT: 'нет'
  });
  assert.equal(broken.dailyLimit, 40);
  assert.equal(broken.screenName, '');
  assert.equal(broken.wallHourLimit, 30);
  assert.equal(broken.gigaConfigured, false);
  assert.equal(loadConfig({ GIGACHAT_DAILY_LIMIT: '0' }).dailyLimit, 0);
});
