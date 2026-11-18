'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { withPromo } = require('../src/promo');
const { matchLesson, loadLessons } = require('../src/lessons');

test('подпись проектов короткая и не двоится', () => {
  const text = withPromo('Рецепт борща.');
  assert.match(text, /Рецепт борща/);
  assert.match(text, /ЯгаГенератор — https:\/\/vk\.ru\/club236645486/);
  assert.match(text, /НейроЯга — https:\/\/vk\.ru\/neuroyaga/);
  assert.match(text, /Баба Яга — https:\/\/vk\.ru\/babyagaland/);
  assert.match(text, /Точки и линии — https:\/\/vk\.ru\/tochki_linii/);
  assert.equal(withPromo(text), text);

  const lesson = { title: 'Медовик', url: 'https://vk.ru/wall-2_2', kind: 'masterclass' };
  const withLesson = withPromo('Торт.', { lesson });
  assert.match(withLesson, /Рекомендую мастер-класс: Медовик/);
  assert.match(withLesson, /wall-2_2/);

  const long = withPromo('а'.repeat(600), { compact: true });
  assert.ok(long.length <= 500);
  assert.match(long, /НейроЯга/);
});

test('каталог второго сообщества советует только похожее', () => {
  const lessons = [
    { title: 'Медовик', url: 'https://vk.ru/wall-2_2', kind: 'masterclass', keys: 'медовик торт коржи' },
    { title: 'Борщ', url: 'https://vk.ru/wall-2_3', kind: 'recipe', keys: 'борщ свекла щи' }
  ];
  assert.equal(matchLesson('как дела', lessons), null);
  assert.equal(matchLesson('медовик', lessons).url, 'https://vk.ru/wall-2_2');
  assert.equal(matchLesson('свекла и щи', lessons).title, 'Борщ');
  assert.equal(loadLessons('/tmp/kitchen-no-lessons.json').length, 0);
});
