'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readWebToken, paywallTitle, loadPublicCatalog } = require('../src/source-public');
const { collectLessons } = require('../src/lessons');

test('каталог читается с открытой страницы и не светит ключ', async () => {
  assert.equal(readWebToken('<html>"access_token":"anonym.test-token"'), 'anonym.test-token');
  assert.equal(readWebToken('пусто'), '');
  assert.equal(paywallTitle({ donut: { paywall: { snippet: { title: 'Post only available' } } } }), '');

  const calls = [];
  const axios = {
    get: async () => ({ data: 'page "access_token":"anonym.test-token" end' }),
    post: async (url, body) => {
      const params = Object.fromEntries(new URLSearchParams(body));
      calls.push({ url, method: url.split('/').pop(), filter: params.filter || '', token: params.access_token });
      if (params.filter === 'donut') {
        return { data: { response: { count: 1, items: [{ id: 2, text: '', donut: { is_donut: true, paywall: { snippet: { title: 'Мастер-класс по торту «Земляничный домик»' } } } }] } } };
      }
      if (params.filter === 'owner') {
        return { data: { response: { count: 1, items: [{ id: 9, text: 'Рецепт чизкейка на четверых.' }] } } };
      }
      if (url.endsWith('/articles.getOwnerPublished')) {
        return { data: { response: { count: 1, items: [{ id: 6, owner_id: -213938339, title: 'Бисквит на желтках', url: 'https://vk.com/@babyagaland-biskvit' }] } } };
      }
      if (url.endsWith('/groups.getById')) {
        return { data: { response: { groups: [{ menu: { items: [] } }] } } };
      }
      return { data: { response: { count: 0, items: [] } } };
    }
  };

  const bundle = await loadPublicCatalog({ groupId: '213938339', axios });
  assert.equal(calls.every(item => item.token === 'anonym.test-token'), true);
  assert.equal(bundle.posts.length, 1);
  assert.equal(bundle.donut[0].text, 'Мастер-класс по торту «Земляничный домик»');
  const lessons = collectLessons({
    posts: bundle.posts.concat(bundle.donut),
    articles: bundle.articles
  }, '213938339');
  const paid = lessons.find(item => item.kind === 'paid');
  assert.equal(paid.url, 'https://vk.ru/wall-213938339_2');
  assert.match(paid.title, /Земляничный домик/);
  assert.equal(lessons.some(item => item.kind === 'article'), true);
});
