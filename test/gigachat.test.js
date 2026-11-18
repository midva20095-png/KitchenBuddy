'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createGigaChat, AUTH_URL, API_URL } = require('../src/gigachat');

test('GigaChat берёт ключ один раз и повторяет запрос после 401', async () => {
  const calls = [];
  let clock = 1_000_000;
  let chats = 0;
  let oauth = 0;
  const agent = { mocked: true };
  const giga = createGigaChat({
    env: { GIGACHAT_AUTH_KEY: 'abc', GIGACHAT_MODEL: 'giga-pro' },
    now: () => clock,
    agent,
    axios: {
      post: async (url, body, options) => {
        calls.push({ url, body, auth: options.headers.Authorization, agent: options.httpsAgent });
        if (url === AUTH_URL) {
          oauth += 1;
          assert.match(String(body), /scope=GIGACHAT_API_PERS/);
          assert.equal(options.headers.Authorization, 'Basic abc');
          assert.equal(options.headers.RqUID.length, 36);
          return { data: { access_token: `tok-${oauth}` } };
        }
        assert.equal(url, API_URL);
        chats += 1;
        if (chats === 1) {
          const error = new Error('unauthorized');
          error.response = { status: 401 };
          throw error;
        }
        if (body.messages.at(-1).content === 'борщ') {
          assert.equal(body.model, 'GigaChat-2-Pro');
          assert.equal(body.messages[0].role, 'system');
          assert.equal(body.messages[1].content, 'прошлый');
        }
        return { data: { choices: [{ message: { content: 'TEXT: снова' } }] } };
      }
    }
  });
  const text = await giga.complete({
    system: 'ты повар',
    history: [{ role: 'system', content: 'лишнее' }, { role: 'assistant', content: 'прошлый' }],
    prompt: 'борщ'
  });
  assert.equal(text, 'TEXT: снова');
  assert.equal(oauth, 2);
  assert.equal(calls.at(-1).auth, 'Bearer tok-2');
  assert.equal(calls[0].agent, agent);
  await giga.complete({ system: 'ты повар', history: [], prompt: 'ещё' });
  assert.equal(oauth, 2);
  clock += 26 * 60 * 1000;
  await giga.complete({ system: 'ты повар', history: [], prompt: 'утром' });
  assert.equal(oauth, 3);
});

test('без ключа GigaChat запрос не уходит', async () => {
  let called = false;
  const giga = createGigaChat({
    env: {},
    agent: {},
    axios: { post: async () => { called = true; return { data: {} }; } }
  });
  await assert.rejects(() => giga.complete({ system: 's', prompt: 'p' }), /GIGACHAT_AUTH_KEY/);
  assert.equal(called, false);
});
