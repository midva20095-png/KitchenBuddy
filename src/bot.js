'use strict';

const { blankUser, overLimit, turn, complete, fromCatalog, limitTurn } = require('./dialog');
const { menuKeyboard, hubKeyboard } = require('./keyboard');
const { formatCatalog } = require('./catalog');
const { systemPrompt, buildUserPrompt } = require('./prompt');
const { blockedReason } = require('./guard');
const { wallWorthy } = require('./incoming');
const { withPromo } = require('./promo');
const { formatRecipe } = require('./recipe');
const { sectionGuess } = require('./menu');

const FAIL = 'В базе сейчас нет ответа. Напишите ещё раз через минуту.';

function makeCtx(config, now, lessons) {
  const screen = config.screenName;
  return {
    now,
    botName: config.botName,
    communityName: config.communityName,
    lessons: lessons || [],
    invite: screen
      ? `Полный рецепт — в сообщениях: https://vk.me/${screen}`
      : 'Полный рецепт — в сообщениях сообщества.'
  };
}

function joinText(config) {
  const id = String((config && config.groupId) || '').replace(/\D/g, '');
  const screen = config && config.screenName;
  const url = screen ? `https://vk.ru/${screen}` : (id ? `https://vk.ru/club${id}` : 'https://vk.ru/club243405772');
  return [
    'Бот отвечает подписчикам сообщества.',
    `Вступить: ${url}`,
    'После вступления напишите «Начать».'
  ].join('\n');
}

function createBot(options) {
  const store = options.store;
  const giga = options.giga;
  const config = options.config;
  const send = options.send;
  const comment = options.comment;
  const typing = options.typing;
  const clock = options.now || (() => new Date());
  const lessons = options.lessons || (config && config.lessons) || [];
  const memberOf = options.member;
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

  async function openClient(userId) {
    if (!store.ensureClient) return { isNew: false, blocked: false, name: '' };
    let card = { isNew: false, blocked: false, name: '' };
    try {
      card = await store.ensureClient(userId, null, config.groupId) || card;
    } catch (error) {
      console.error('Клиента не записала.');
      return card;
    }
    if (!card.name && options.profile) {
      try {
        const face = await options.profile(userId);
        if (face && face.name) {
          card = await store.ensureClient(userId, face, config.groupId, { count: false }) || card;
        }
      } catch (error) {}
    }
    return card;
  }

  async function rememberShare(userId, result) {
    let saved = null;
    if (store.saveShared) {
      try {
        saved = await store.saveShared(userId, result.share);
      } catch (error) {
        console.error('Рецепт для общего доступа не сохранился.');
      }
    }
    result.user.pendingShare = {
      id: saved && saved.id ? String(saved.id) : '',
      title: result.share.title,
      body: result.share.body,
      source: result.share.source || 'own'
    };
  }

  async function publish(peer, userId, item) {
    if (!item || !item.body) {
      return deliver(peer, [{ text: 'Нечего публиковать. Откройте рецепт и нажмите «Поделиться».', keyboard: menuKeyboard() }]);
    }
    if (!options.post) {
      return deliver(peer, [{ text: 'Стена сейчас недоступна. Текст рецепта можно переслать из этой переписки.', keyboard: menuKeyboard() }]);
    }
    let postId = '';
    try {
      postId = await options.post(withPromo(item.body));
    } catch (error) {
      console.error('Рецепт не выложился на стену.');
      return deliver(peer, [{ text: 'Не выложила на стену. Текст рецепта остался в переписке, его можно переслать.', keyboard: menuKeyboard() }]);
    }
    if (store.markShared && item.id) {
      try { await store.markShared(item.id, postId); } catch (error) {}
    }
    await journal(userId, 'share', item.title);
    return deliver(peer, [{ text: 'Рецепт на стене сообщества. Из этой переписки его можно переслать друзьям.', keyboard: menuKeyboard() }]);
  }

  async function journal(userId, kind, body) {
    if (!store.note) return;
    try {
      await store.note(userId, kind, body);
    } catch (error) {
      console.error('Запись в журнал клиента не сохранилась.');
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

  async function rememberRecipe(userId, job, recipe) {
    if (!store.saveCatalog || !recipe || !recipe.title) return;
    const data = (job && job.data) || {};
    let category = job && job.kind === 'section' ? String(data.section || '') : '';
    if (!category) category = sectionGuess(data.dish || recipe.title || '');
    try {
      await store.saveCatalog(userId, {
        category,
        title: recipe.title,
        query: data.dish || recipe.title,
        recipe,
        body: formatRecipe(recipe),
        source: 'found'
      });
    } catch (error) {
      console.error('Рецепт в общую базу не сохранился.');
    }
  }

  async function findSaved(userId, job) {
    if (!store.findCatalog || !job || !['section', 'dish'].includes(job.kind)) return null;
    const data = job.data || {};
    const dish = data.dish || '';
    if (!dish) return null;
    try {
      return await store.findCatalog(userId, {
        category: job.kind === 'section' ? (data.section || '') : '',
        dish,
        text: job.memory
      });
    } catch (error) {
      console.error('Поиск в базе не удался.');
      return null;
    }
  }

  async function askModel(system, history, prompt) {
    return slot(() => giga.complete({ system, history, prompt }));
  }

  async function subscriber(userId) {
    if (!config.subscribersOnly || !memberOf) return true;
    try {
      return await memberOf(userId);
    } catch (error) {
      console.error('ВК: подписку не проверила, отвечаю как обычно.');
      return true;
    }
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
    const card = await openClient(input.userId);
    if (card.blocked) return [];
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
    await journal(input.userId, 'comment', input.text);
    await keep(done.user);
    return [{ text: done.commentText, comment: true }];
  }

  async function run(input) {
    const now = clock();
    const ctx = makeCtx(config, now, lessons);
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
    if (!(await subscriber(userId))) {
      const peek = turn(user, fresh, ctx);
      if (peek.ignore) return [];
      await openClient(userId);
      await journal(userId, 'join', '');
      console.log('ВК: не подписчик, отправила ссылку на сообщество.');
      return deliver(fresh.peerId, [{ text: joinText(config), keyboard: menuKeyboard() }]);
    }
    const result = turn(user, fresh, ctx);
    if (result.ignore) return [];
    const card = await openClient(userId);
    if (card.blocked) {
      return deliver(fresh.peerId, [{ text: 'Сейчас бот вам не отвечает.', keyboard: menuKeyboard() }]);
    }
    if (result.post) return publish(fresh.peerId, userId, result.post);
    if (result.share) await rememberShare(userId, result);
    if (result.catalog && store.saveCatalog) {
      try {
        await store.saveCatalog(userId, result.catalog);
      } catch (error) {
        console.error('Рецепт в базу не сохранился.');
      }
    }
    if (result.listCatalog) {
      let rows = [];
      if (store.listCatalog) {
        try { rows = await store.listCatalog(userId); } catch (error) { rows = []; }
      }
      await keep(result.user);
      return deliver(fresh.peerId, [{ text: formatCatalog(rows), keyboard: hubKeyboard('mine') || menuKeyboard() }]);
    }
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
    const found = await findSaved(userId, result.job);
    if (found) {
      const done = fromCatalog(result.user, result.job, found, ctx);
      await journal(userId, 'found', found.title || '');
      await keep(done.user);
      const rest = await deliver(fresh.peerId, done.messages);
      return prelude.concat(rest);
    }
    let raw = '';
    try {
      raw = await askModel(systemPrompt(config.communityName), result.user.history, result.job.prompt);
    } catch (error) {
      const status = error && error.response && error.response.status;
      console.error(`GigaChat не ответил${status ? ` (HTTP ${status})` : ''}.`);
      const failed = await deliver(fresh.peerId, [{ text: withPromo(FAIL), keyboard: menuKeyboard() }]);
      return prelude.concat(failed);
    }
    const done = complete(result.user, result.job, raw, ctx);
    const title = done.user.lastRecipe && done.user.lastRecipe.title;
    if (done.recipe) await rememberRecipe(userId, result.job, done.user.lastRecipe);
    await journal(userId, done.recipe ? 'recipe' : 'reply', done.recipe ? title : result.job.memory);
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
