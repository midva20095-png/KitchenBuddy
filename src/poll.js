'use strict';

const { connectHint } = require('./vk');
const { readUpdate } = require('./incoming');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startPoll(options) {
  const vk = options.vk;
  const bot = options.bot;
  const config = options.config;
  const state = options.state || {};
  const pause = options.sleepFn || sleep;
  const read = options.readUpdate || readUpdate;
  const found = await vk.resolveGroup();
  if (found && found.id) vk.groupId = String(found.id).replace(/\D/g, '');
  if (found && found.name) state.communityName = found.name;
  if (!vk.groupId) {
    state.vkOnline = false;
    state.vkHint = 'Не задан номер сообщества, и ключ его не показал.';
    console.error(state.vkHint);
    return;
  }
  config.groupId = vk.groupId;
  const title = found && found.name ? ` «${found.name}»` : '';
  console.log(`ВК ${vk.groupId}${title}: слушаю сообщения.`);
  let online = false;
  let failLogged = false;
  for (;;) {
    try {
      let server = await vk.longPollServer();
      if (!server || !server.server || !server.key) throw new Error('Пустой адрес Long Poll');
      state.vkOnline = true;
      state.vkHint = '';
      if (!online) {
        online = true;
        failLogged = false;
        console.log(`ВК ${vk.groupId} подключён, жду сообщения.`);
        try { await vk.enable(); } catch (error) {}
      }
      for (;;) {
        let packet;
        try {
          packet = await vk.poll(server);
        } catch (error) {
          await pause(3000);
          break;
        }
        if (!packet || packet.restart) break;
        server = packet.server || server;
        const updates = Array.isArray(packet.updates) ? packet.updates : [];
        for (const update of updates) {
          const input = read(update, vk.groupId);
          if (!input) continue;
          if (!config.wallReplies && input.place === 'wall') continue;
          if (!config.chatReplies && input.place === 'chat') continue;
          bot.handle(input).catch(() => {
            console.error(`ВК ${vk.groupId}: сообщение не обработано.`);
          });
        }
      }
    } catch (error) {
      online = false;
      state.vkOnline = false;
      state.vkHint = connectHint(error);
      if (!failLogged) {
        failLogged = true;
        const code = Number(error && error.code);
        console.error(`ВК ${vk.groupId} не подключился${code ? ` (${code})` : ''}. ${state.vkHint}`);
      }
      await pause(15000);
    }
  }
}

module.exports = { startPoll };
