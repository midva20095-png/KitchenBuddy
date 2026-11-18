'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { chatLink, widgetCode, failText, uploadCover } = require('../src/widget');

test('кнопка поиска ведёт в чат сообщества', () => {
  assert.equal(chatLink('243405772'), 'https://vk.com/write-243405772');
  const code = widgetCode('243405772', '-243405772_10');
  assert.match(code, /Поиск рецептов/);
  assert.match(code, /write-243405772/);
  assert.doesNotMatch(code, /54901511/);
  assert.match(failText({ error_code: 15 }), /Поставить на страницу/);
  assert.match(failText({ error_code: 5 }), /ВК ответил 5/);
});

test('картинка кнопки уходит с ключом сообщества', async () => {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options: options || {} });
    if (String(url).includes('getGroupImageUploadServer')) {
      return { json: async () => ({ response: { upload_url: 'https://pu.vk.com/upload' } }) };
    }
    if (String(url).includes('pu.vk.com')) {
      return { text: async () => JSON.stringify({ hash: 'abc', sha: 'def' }), status: 200 };
    }
    return { json: async () => ({ response: { id: '-243405772_10' } }) };
  };
  try {
    const id = await uploadCover('community-token-value', Buffer.from('jpeg'));
    assert.equal(id, '-243405772_10');
    const upload = calls.find(item => item.url.includes('pu.vk.com'));
    assert.equal(upload.options.headers.Authorization, 'Bearer community-token-value');
    const save = calls.find(item => item.url.includes('saveGroupImage'));
    assert.match(String(save.options.body), /image=/);
  } finally {
    global.fetch = original;
  }
});
