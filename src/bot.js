'use strict';

const { blankUser, overLimit, turn, complete, limitTurn } = require('./dialog');
const { menuKeyboard } = require('./keyboard');
const { systemPrompt, buildUserPrompt } = require('./prompt');
const { blockedReason } = require('./guard');
const { wallWorthy } = require('./incoming');

const FAIL = 'Повар сейчас не ответил. Напишите ещё раз через минуту.';

function makeCtx(config, now) {
  const screen = config.screenName;
  return {
    now,
    botName: config.botName,
    communityName: config.communityName,
    invite: screen
      ? `Полный рецепт — в сообщениях: https://vk.me/${screen}`
      : 'Полный рецепт — в сообщениях сообщества.'
  };
}

function createBot(options) {
  const store = options.store;
  const giga = options.giga;
  const config = options.config;
  const send = options.send;
  const comment = options.comment;
  const typing = options.typing;
  const clock = options.now || (() => new Date());
  const seen = new Set();
  const tails = new Map();
  const wallTimes = [];
  let active = 0;
  const waiters = [];

  function rememberSeen(key) {
    if (!key) return false;
    if (seen.has(key)) return true;
    seen.add(key);
    if (seen.size > 1000) seen.delete(seen.values().next().value);
    return false;
  }

  function wallRoom(now) {
    const limit = config.wallHourLimit == null ? 30 : config.wallHourLimit;
    if (!limit) return true;
    const cutoff = now.getTime() - 60 * 60 * 1000;
    while (wallTimes.length && wallTimes[0] < cutoff) wallTimes.shift();
    return wallTimes.length < limit;
  }

  function markWall(now) {
    wallTimes.push(now.getTime());
  }

  async function slot(fn) {
    const limit = config.aiParallel || 2;
    if (active >= limit) await new Promise(resolve => waiters.push(resolve));
    active += 1;
    try {
      return await fn();
    } finally {
      active -= 1;
      const next = waiters.shift();
      if (next) next();
    }
  }

  async function keep(user) {
    try {
      await store.saveUser(user);
    } catch (error) {
      console.error('Не сохранила диалог.');
    }
  }

  async function deliver(peer, messages) {
    const out = [];
    for (const message of messages || []) {
      try {
        await send(peer, message.text, message.keyboard);
        out.push(message);
      } catch (error) {
        const code = error && error.code;
        console.error(`ВК: ответ не ушёл${code ? ` (${code})` : ''}.`);
      }
    }
    return out;
  }

  async function askModel(system, history, prompt) {
    return slot(() => giga.complete({ system, history, prompt }));
  }

  async function runWall(input, now, ctx) {
    if (blockedReason(input.text) || !wallWorthy(input.text)) return [];
    const key = `${config.groupId || '0'}:${input.commentId}`;
    if (rememberSeen(`c:${key}`)) return [];
    let known = false;
    try {
      known = await store.hasComment(key);
    } catch (error) {
      return [];
    }
    if (known || !wallRoom(now)) return [];
    let user = null;
    try {
      user = await store.getUser(input.userId);
    } catch (error) {
      user = null;
    }
    if (!user) user = blankUser(input.userId);
    if (overLimit(user, config.dailyLimit, now, 'wall')) return [];
    const job = {
      usesAi: true,
      kind: 'comment',
      prompt: buildUserPrompt('comment', { text: input.text }),
      memory: input.text
    };
    let raw = '';
    try {
      raw = await askModel(systemPrompt(config.communityName), [], job.prompt);
    } catch (error) {
      console.error('GigaChat не ответил на комментарий.');
      return [];
    }
    const done = complete(user, job, raw, ctx);
    if (!done.commentText) return [];
    try {
      await comment(input, done.commentText);
    } catch (error) {
      const code = error && error.code;
      console.error(`ВК: комментарий не отправился${code ? ` (${code})` : ''}.`);
      return [];
    }
    markWall(now);
    try { await store.markComment(key); } catch (error) {}
    await keep(done.user);
    return [{ text: done.commentText, comment: true }];
  }

  async function run(input) {
    const now = clock();
    const ctx = makeCtx(config, now);
    const userId = String((input && input.userId) || '').replace(/\D/g, '');
    if (!input || !userId) return [];
    const fresh = Object.assign({}, input, { userId });
    if (fresh.place === 'wall') return runWall(fresh, now, ctx);
    if (fresh.messageId && rememberSeen(`m:${fresh.peerId}:${fresh.messageId}`)) return [];
    let user = null;
    try {
      user = await store.getUser(userId);
    } catch (error) {
      user = null;
    }
    if (!user) user = blankUser(userId);
    const result = turn(user, fresh, ctx);
    if (result.ignore) return [];
    if (!result.job) {
      await keep(result.user);
      return deliver(fresh.peerId, result.messages);
    }
    if (overLimit(result.user, config.dailyLimit, now, 'dm')) {
      const limited = limitTurn(result.user);
      await keep(limited.user);
      return deliver(fresh.peerId, limited.messages);
    }
    await keep(result.user);
    const prelude = await deliver(fresh.peerId, result.messages);
    if (typing) {
      try { await typing(fresh.peerId); } catch (error) {}
    }
    let raw = '';
    try {
      raw = await askModel(systemPrompt(config.communityName), result.user.history, result.job.prompt);
    } catch (error) {
      const status = error && error.response && error.response.status;
      console.error(`GigaChat не ответил${status ? ` (HTTP ${status})` : ''}.`);
      const failed = await deliver(fresh.peerId, [{ text: FAIL, keyboard: menuKeyboard() }]);
      return prelude.concat(failed);
    }
    const done = complete(result.user, result.job, raw, ctx);
    await keep(done.user);
    const rest = await deliver(fresh.peerId, done.messages);
    return prelude.concat(rest);
  }

  function handle(input) {
    const id = String((input && (input.userId || input.commentId)) || 'x');
    const prev = tails.get(id) || Promise.resolve();
    const runNext = prev.then(() => run(input), () => run(input));
    tails.set(id, runNext.then(() => {}, () => {}));
    return runNext;
  }

  return { handle };
}

module.exports = { createBot, FAIL };
