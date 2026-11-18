'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { menuKeyboard, recipeKeyboard, servingsKeyboard, favoritesKeyboard } = require('../src/keyboard');
const { sectionIds, sectionKeyboard } = require('../src/menu');

function rows(raw) {
  return JSON.parse(raw).buttons;
}

test('клавиатура ВК помещается в лимиты кнопок', () => {
  const boards = [
    menuKeyboard(),
    recipeKeyboard({ steps: ['a', 'b'] }),
    servingsKeyboard(),
    favoritesKeyboard([{ title: 'Очень длинное название домашнего блюда с грибами и сметаной' }])
  ].concat(sectionIds().map(sectionKeyboard).filter(Boolean));
  for (const raw of boards) {
    const buttons = rows(raw);
    assert.ok(buttons.length <= 10);
    for (const row of buttons) {
      assert.ok(row.length <= 4);
      for (const button of row) {
        assert.equal(button.action.type, 'text');
        assert.ok(button.action.label.length <= 40);
        assert.ok(button.action.payload.length <= 255);
        JSON.parse(button.action.payload);
      }
    }
  }
  const labels = rows(menuKeyboard()).flat().map(button => button.action.label);
  assert.deepEqual(labels, [
    'Первые', 'Вторые', 'Салаты', 'Закуски', 'Завтраки', 'Напитки', 'Выпечка', 'Десерты',
    'Кондитеру', 'Аллергены', 'Диета', 'Из продуктов', 'Быстрый ужин', 'Случайный', 'Избранное', 'Помощь'
  ]);
});
