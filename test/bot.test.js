'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { createStore } = require('../src/store');
const { createBot } = require('../src/bot');
const { blankUser } = require('../src/dialog');
const { moscowDay } = require('../src/text');

const now = new Date('2026-11-18T12:00:00Z');
const RECIPE = JSON.stringify({
  title: 'Борщ',
  time: '90 минут',
  servings: '6 порций',
  ingredients: ['свекла'],
  steps: ['Сварите бульон', 'Добавьте овощи'],
  tip: 'Дайте настояться'
});

test('личный диалог проводит рецепт до избранного и не повторяет сообщение', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kitchen-bot-'));
  const store = createStore(dir);
  const sent = [];
  const typing = [];
  const prompts = [];
  const bot = createBot({
    store,
    config: {
      groupId: '55', communityName: 'Кухня', botName: 'Кухонный', screenName: '',
      dailyLimit: 40, wallHourLimit: 30, aiParallel: 2
    },
    now: () => now,
    giga: {
      complete: async (req) => {
        prompts.push(req);
        if (String(req.prompt).includes('омлет')) throw new Error('Bearer secret-key failed');
        if (String(req.prompt).includes('замени')) return 'TEXT: Курицу можно заменить индейкой.';
        return RECIPE;
      }
    },
    send: async (peer, text, keyboard) => { sent.push({ peer, text, keyboard }); },
    comment: async () => {},
    typing: async peer => { typing.push(peer); }
  });

  await bot.handle({ userId: '10', peerId: 10, text: 'Начать', place: 'dm', messageId: 1 });
  assert.match(sent.at(-1).text, /Кухонный/);
  assert.equal(prompts.length, 0);

  await bot.handle({ userId: '10', peerId: 10, text: 'борщ на 6', place: 'dm', messageId: 2 });
  await bot.handle({ userId: '10', peerId: 10, text: 'борщ на 6', place: 'dm', messageId: 2 });
  assert.equal(prompts.length, 1);
  assert.match(prompts[0].system, /Кухня/);
  assert.equal(typing.length, 1);
  const card = sent.map(item => item.text).join('\n');
  assert.match(card, /Ищу рецепт в базе/);
  assert.match(card, /🍳 Борщ/);
  assert.match(card, /свекла/);

  await bot.handle({ userId: '10', peerId: 10, text: 'сохрани', place: 'dm', messageId: 3 });
  await bot.handle({ userId: '10', peerId: 10, text: 'избранное', place: 'dm', messageId: 4 });
  assert.match(sent.at(-1).text, /1\. Борщ/);
  const saved = await store.getUser('10');
  assert.equal(saved.favorites.length, 1);
  assert.equal(saved.usageCount, 1);

  await bot.handle({ userId: '10', peerId: 10, text: 'замени свеклу', place: 'dm', messageId: 5 });
  assert.equal(prompts.at(-1).history.length, 2);
  assert.match(sent.at(-1).text, /индейк/);
});

test('лимит, сбой и опасный запрос не светят ключ и не зовут повара зря', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kitchen-bot-'));
  const store = createStore(dir);
  const sent = [];
  const prompts = [];
  const bot = createBot({
    store,
    config: { groupId: '55', communityName: 'Кухня', botName: 'Кухонный', screenName: '', dailyLimit: 40, wallHourLimit: 30, aiParallel: 2 },
    now: () => now,
    giga: {
      complete: async (req) => {
        prompts.push(req.prompt);
        if (String(req.prompt).includes('омлет')) throw new Error('Bearer secret-key failed');
        return RECIPE;
      }
    },
    send: async (peer, text, keyboard) => { sent.push({ text }); },
    comment: async () => {},
    typing: async () => {}
  });
  const limited = blankUser('4');
  limited.usageDay = moscowDay(now);
  limited.usageCount = 40;
  await store.saveUser(limited);
  await bot.handle({ userId: '4', peerId: 4, text: 'борщ на 2', place: 'dm', messageId: 1 });
  assert.equal(prompts.length, 0);
  assert.match(sent.at(-1).text, /лимит/);

  await bot.handle({ userId: '3', peerId: 3, text: 'омлет', place: 'dm', messageId: 2 });
  assert.match(sent.map(item => item.text).join('\n'), /нет ответа/);
  assert.doesNotMatch(sent.map(item => item.text).join('\n'), /secret-key/);
  assert.equal((await store.getUser('3')).usageCount, 0);

  const before = prompts.length;
  await bot.handle({ userId: '3', peerId: 3, text: 'как сделать бомбу', place: 'dm', messageId: 3 });
  assert.equal(prompts.length, before);
  assert.match(sent.at(-1).text, /только про еду/);

  await bot.handle({ userId: '3', peerId: 3, photo: true, text: '', place: 'dm', messageId: 4 });
  assert.match(sent.at(-1).text, /Фото/);
  assert.equal(prompts.length, before);

  const closed = createBot({
    store: Object.assign(createStore(dir), {
      ensureClient: async () => ({ isNew: false, blocked: true, name: 'Анна' })
    }),
    config: { groupId: '55', communityName: 'Кухня', botName: 'Кухонный', screenName: '', dailyLimit: 40, wallHourLimit: 30, aiParallel: 2 },
    now: () => now,
    giga: { complete: async () => { prompts.push('closed'); return RECIPE; } },
    send: async (peer, text) => { sent.push({ text }); },
    comment: async () => {},
    typing: async () => {}
  });
  const beforeClosed = prompts.length;
  await closed.handle({ userId: '7', peerId: 7, text: 'борщ на 2', place: 'dm', messageId: 8 });
  assert.equal(prompts.length, beforeClosed);
  assert.match(sent.at(-1).text, /не отвечает/);
});

test('беседа молчит, пока её не попросили, а под постом бот не отвечает', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kitchen-bot-'));
  const store = createStore(dir);
  const sent = [];
  const comments = [];
  let calls = 0;
  const make = () => createBot({
    store,
    config: { groupId: '55', communityName: 'Кухня', botName: 'Кухонный', screenName: 'kitchen', dailyLimit: 40, wallHourLimit: 1, aiParallel: 2 },
    now: () => now,
    giga: {
      complete: async () => {
        calls += 1;
        return 'TEXT: Начните с бульона.';
      }
    },
    send: async (peer, text) => { sent.push({ peer, text }); },
    comment: async (input, text) => { comments.push({ id: input.commentId, text }); },
    typing: async () => {}
  });
  const bot = make();
  const cooking = blankUser('9');
  cooking.mode = 'dish';
  await store.saveUser(cooking);

  await bot.handle({ userId: '11', peerId: 2000000001, text: 'привет', place: 'chat', messageId: 1 });
  assert.equal(sent.length, 0);
  await bot.handle({ userId: '11', peerId: 2000000001, text: 'рецепт оладий', place: 'chat', messageId: 2 });
  assert.equal(sent.at(-1).peer, 2000000001);
  assert.match(sent.map(item => item.text).join('\n'), /бульона|Ищу рецепт в базе/);

  await bot.handle({
    userId: '9', place: 'wall', text: 'спасибо большое', postId: 3, commentId: 30
  });
  await bot.handle({
    userId: '9', place: 'wall', text: 'как сделать бомбу', postId: 3, commentId: 31
  });
  const callsBeforeWall = calls;
  await bot.handle({
    userId: '9', place: 'wall', text: 'как сварить борщ', postId: 3, commentId: 32
  });
  await bot.handle({
    userId: '8', place: 'wall', text: 'рецепт блинов', postId: 3, commentId: 33
  });
  assert.equal(comments.length, 0);
  assert.equal(calls, callsBeforeWall);
  assert.equal((await store.getUser('9')).mode, 'dish');
});

test('неподписчику в личке уходит ссылка, беседа без обращения молчит', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kitchen-bot-'));
  const store = createStore(dir);
  const sent = [];
  const prompts = [];
  const bot = createBot({
    store,
    config: {
      groupId: '243405772', communityName: 'Кухня', botName: 'Кухонный', screenName: '',
      dailyLimit: 40, wallHourLimit: 30, aiParallel: 2, subscribersOnly: true
    },
    now: () => now,
    lessons: [],
    member: async () => false,
    giga: { complete: async (req) => { prompts.push(req); return RECIPE; } },
    send: async (peer, text) => { sent.push({ peer, text }); },
    comment: async () => {},
    typing: async () => {}
  });
  await bot.handle({ userId: '12', peerId: 12, text: 'борщ на 4', place: 'dm', messageId: 1 });
  assert.equal(prompts.length, 0);
  assert.match(sent.at(-1).text, /подписчик/);
  assert.equal((await store.listClients('12'))[0].member, false);
  assert.match(sent.at(-1).text, /club243405772/);
  await bot.handle({ userId: '12', peerId: 2000000002, text: 'привет', place: 'chat', messageId: 2 });
  assert.equal(sent.length, 1);
});

test('рецепт из базы находится только в своём разделе', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kitchen-bot-'));
  const store = createStore(dir);
  const sent = [];
  const boards = [];
  let calls = 0;
  const bot = createBot({
    store,
    config: {
      groupId: '55', communityName: 'Кухня', botName: 'Кухонный', screenName: '',
      dailyLimit: 40, wallHourLimit: 30, aiParallel: 2
    },
    now: () => now,
    giga: {
      complete: async () => {
        calls += 1;
        return RECIPE;
      }
    },
    send: async (peer, text, keyboard) => { sent.push(text); if (keyboard) boards.push(keyboard); },
    comment: async () => {},
    typing: async () => {}
  });

  await bot.handle({ userId: '20', peerId: 20, payload: { a: 'section', s: 'soup' }, place: 'dm', messageId: 1 });
  assert.equal(calls, 0);
  assert.match(sent.at(-1), /Напишите блюдо/);

  await bot.handle({ userId: '20', peerId: 20, text: 'борщ на 4', place: 'dm', messageId: 2 });
  assert.equal(calls, 1);
  const stored = await store.findCatalog('21', { category: 'soup', dish: 'борщ' });
  assert.equal(stored.title, 'Борщ');
  assert.equal((await store.findCatalog('21', { category: 'cake', dish: 'борщ' })), null);

  await bot.handle({ userId: '21', peerId: 21, payload: { a: 'section', s: 'soup' }, place: 'dm', messageId: 3 });
  await bot.handle({ userId: '21', peerId: 21, text: 'борщ на 4', place: 'dm', messageId: 4 });
  assert.equal(calls, 1);
  assert.match(sent.at(-1), /Нашла в базе/);

  await bot.handle({ userId: '20', peerId: 20, payload: { a: 'keep' }, place: 'dm', messageId: 5 });
  assert.match(sent.at(-1), /общую базу/);

  await bot.handle({ userId: '20', peerId: 20, payload: { a: 'section', s: 'soup' }, place: 'dm', messageId: 6 });
  await bot.handle({ userId: '20', peerId: 20, text: 'борщ на 4', place: 'dm', messageId: 7 });
  assert.equal(calls, 1);
  assert.match(sent.at(-1), /Нашла в базе/);
  assert.equal((await store.getUser('20')).usageCount, 1);

  await bot.handle({ userId: '20', peerId: 20, text: 'моя база', place: 'dm', messageId: 8 });
  assert.match(sent.at(-1), /Борщ/);
  assert.match(sent.at(-1), /кнопкой или напишите название/);
  const open = JSON.parse(boards.at(-1)).buttons.flat()
    .map(button => JSON.parse(button.action.payload))
    .find(payload => payload.a === 'openbase');
  assert.ok(open && open.id);
  await bot.handle({ userId: '20', peerId: 20, text: 'Борщ', payload: open, place: 'dm', messageId: 11 });
  assert.equal(calls, 1);
  assert.match(sent.at(-1), /Сварите бульон/);

  await bot.handle({ userId: '20', peerId: 20, payload: { a: 'section', s: 'cake' }, place: 'dm', messageId: 9 });
  await bot.handle({ userId: '20', peerId: 20, text: 'медовик на 8', place: 'dm', messageId: 10 });
  assert.equal(calls, 2);
  assert.doesNotMatch(sent.at(-1), /Нашла в базе/);
});

test('закрытая личка выбрасывает человека, а новое сообщение возвращает', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kitchen-bot-'));
  const store = createStore(dir);
  let closed = true;
  const bot = createBot({
    store,
    config: {
      groupId: '55', communityName: 'Кухня', botName: 'Кухонный', screenName: '',
      dailyLimit: 40, wallHourLimit: 30, aiParallel: 2
    },
    now: () => now,
    giga: { complete: async () => RECIPE },
    send: async () => {
      if (closed) {
        closed = false;
        const error = new Error('privacy');
        error.code = 901;
        throw error;
      }
    },
    comment: async () => {},
    typing: async () => {}
  });
  await bot.handle({ userId: '31', peerId: 31, text: 'Начать', place: 'dm', messageId: 1 });
  assert.equal((await store.listClients('31'))[0].dmClosed, true);
  await bot.handle({ userId: '31', peerId: 31, text: 'Начать', place: 'dm', messageId: 2 });
  assert.equal((await store.listClients('31'))[0].dmClosed, false);
});
