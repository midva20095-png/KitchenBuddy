'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRecipe, formatRecipe, formatShopping, formatStep, commentBody, asPlain, titleFits } = require('../src/recipe');

const RAW = '```json\n{"title":"Борщ","time":"90","servings":"6","ingredients":[{"amount":"2 шт.","name":"свекла"},"• капуста"],"steps":["1. Сварите бульон","Добавьте овощи"],"tip":"Дайте настояться"}\n```';

test('рецепт собирается из JSON и печатается карточкой', () => {
  const recipe = parseRecipe(RAW);
  assert.equal(recipe.title, 'Борщ');
  assert.equal(recipe.time, '90 минут');
  assert.equal(recipe.servings, '6 порций');
  assert.deepEqual(recipe.ingredients, ['2 шт. свекла', 'капуста']);
  assert.deepEqual(recipe.steps, ['Сварите бульон', 'Добавьте овощи']);
  const text = formatRecipe(recipe);
  assert.match(text, /🍳 Борщ/);
  assert.match(text, /1\. Сварите бульон/);
  assert.match(text, /Совет: Дайте настояться/);
  const priced = parseRecipe('{"title":"Борщ","ingredients":["свекла"],"steps":["Варите"],"shop":["свекла 500 г — около 40 ₽"],"total":"около 40 ₽","tip":""}');
  assert.match(formatRecipe(priced), /Магните/);
  assert.match(formatRecipe(priced), /около 40 ₽/);
  assert.match(formatShopping(priced), /примерные/);
  assert.doesNotMatch(text, /\*\*|access_token/);
  assert.match(formatShopping(recipe), /Список покупок — Борщ/);
  assert.match(formatStep(recipe, 1), /шаг 2 из 2/);
});

test('название торта подходит без лишнего слова «торт»', () => {
  assert.equal(titleFits('Молочная девочка', 'Молочная девочка торт'), true);
  assert.equal(titleFits('Торт «Молочная девочка»', 'молочная девочка торт'), true);
  assert.equal(titleFits('Борщ', 'медовик'), false);
  assert.equal(titleFits('Борщ', 'Курица с рисом'), false);
  assert.equal(titleFits('Гречневая каша', 'для деобетика'), true);
  assert.equal(titleFits('Борщ', 'борщ для праздника'), true);
});

test('обычный ответ не превращается в рецепт', () => {
  assert.equal(parseRecipe('TEXT: Курицу можно заменить индейкой.'), null);
  assert.equal(asPlain('TEXT: Курицу можно заменить индейкой.'), 'Курицу можно заменить индейкой.');
  assert.equal(asPlain('{"title":"сломанный"}'), '');
  assert.equal(parseRecipe('не json'), null);
  const comment = commentBody('TEXT: Начните с бульона.', 'Полный рецепт — в сообщениях сообщества.');
  assert.match(comment, /Начните с бульона/);
  assert.match(comment, /сообщества/);
  const again = commentBody('TEXT: Уже написала про сообщения сообщества.', 'ещё раз');
  assert.doesNotMatch(again, /ещё раз/);
});
