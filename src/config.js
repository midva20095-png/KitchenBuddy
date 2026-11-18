'use strict';

const path = require('path');

function nonNegative(value, fallback) {
  if (value == null || String(value).trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return fallback;
  return n;
}

function sourceGroup(value) {
  if (value == null || String(value).trim() === '') return '213938339';
  const id = String(value).replace(/\D/g, '');
  return id && id !== '0' ? id : '';
}

function flag(value, fallback) {
  if (value == null || String(value).trim() === '') return fallback;
  return String(value) !== '0';
}

function loadConfig(env) {
  const source = env || process.env;
  const screen = String(source.VK_SCREEN_NAME || '').trim();
  return {
    port: Number(source.PORT) || 8080,
    groupId: String(source.VK_GROUP_ID || '').replace(/\D/g, ''),
    token: String(source.VK_GROUP_TOKEN || '').trim(),
    tokenConfigured: Boolean(String(source.VK_GROUP_TOKEN || '').trim()),
    screenName: /^[a-zA-Z0-9_.]{2,64}$/.test(screen) ? screen : '',
    communityName: String(source.VK_COMMUNITY_NAME || 'Кухня').trim().slice(0, 60) || 'Кухня',
    botName: String(source.BOT_NAME || 'Кухонный').trim().slice(0, 40) || 'Кухонный',
    gigaConfigured: Boolean(String(source.GIGACHAT_AUTH_KEY || '').trim()),
    dailyLimit: nonNegative(source.GIGACHAT_DAILY_LIMIT, 40),
    wallReplies: flag(source.WALL_REPLIES, true),
    chatReplies: flag(source.CHAT_REPLIES, true),
    wallHourLimit: nonNegative(source.WALL_HOUR_LIMIT, 30),
    subscribersOnly: flag(source.SUBSCRIBERS_ONLY, true),
    aiParallel: Math.min(4, Math.max(1, Number(source.AI_PARALLEL) || 2)),
    sourceGroupId: sourceGroup(source.SOURCE_GROUP_ID),
    sourceToken: String(source.SOURCE_GROUP_TOKEN || '').trim(),
    sourceTokenConfigured: Boolean(String(source.SOURCE_GROUP_TOKEN || '').trim()),
    dataDir: path.resolve(String(source.DATA_DIR || path.join(process.cwd(), 'data'))),
    adminPassword: String(source.ADMIN_PASSWORD || '').trim()
  };
}

module.exports = { loadConfig };
