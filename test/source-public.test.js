'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readWebToken, loadPublicCatalog } = require('../src/source-public');
const { collectLessons } = require('../src/lessons');

test('из второго сообщества берутся только статьи', async () => {
  assert.equal(readWebToken('<html>"access_token":"anonym.test-token"'), 'anonym.test-token');
  assert.equal(readWebToken('пусто'), '');

  const calls = [];
  const axios = {
    get: async () => ({ data: 'page "access_token":"anonym.test-token" end' }),
    post: async (url, body) => {
      const params = Object.fromEntries(new URLSearchParams(body));
      calls.push(url.split('/').pop());
      assert.equal(params.access_token, 'anonym.test-token');
      if (url.endsWith('/articles.getOwnerPublished')) {
        return { data: { response: { count: 1, items: [{ id: 6, owner_id: -213938339, title: 'Бисквит на желтках', url: 'https://vk.com/@babyagaland-biskvit' }] } } };
      }
      return { data: { response: { count: 1, items: [{ id: 9, text: 'Рецепт чизкейка на четверых.' }] } } };
    }
  };

  const bundle = await loadPublicCatalog({ groupId: '213938339', axios });
  assert.deepEqual(calls, ['articles.getOwnerPublished']);
  assert.equal(bundle.articles.length, 1);
  const lessons = collectLessons({ articles: bundle.articles }, '213938339');
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0].kind, 'article');
  assert.equal(lessons[0].url, 'https://vk.ru/@babyagaland-biskvit');
});
