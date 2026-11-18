'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { chatLink, widgetCode, failText } = require('../src/widget');

test('кнопка поиска ведёт в чат сообщества', () => {
  assert.equal(chatLink('243405772'), 'https://vk.com/write-243405772');
  const code = widgetCode('243405772', '-243405772_10');
  assert.match(code, /Поиск рецептов/);
  assert.match(code, /write-243405772/);
  assert.doesNotMatch(code, /54901511/);
  assert.match(failText({ error_code: 15 }), /VK_WIDGET_TOKEN/);
});
