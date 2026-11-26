'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { menuKeyboard, hubKeyboard, hubText, recipeKeyboard, servingsKeyboard, favoritesKeyboard, catalogKeyboard } = require('../src/keyboard');
const { sectionIds, sectionById, sectionKeyboard } = require('../src/menu');

const HUBS = ['meal', 'morning', 'sweetbox', 'pick', 'mine', 'world', 'pro', 'dietbox', 'pantry', 'feast'];

function rows(raw) {
  return JSON.parse(raw).buttons;
}

test('клавиатура ВК помещается в лимиты кнопок', () => {
  const boards = [
    menuKeyboard(),
    recipeKeyboard({ steps: ['a', 'b'] }),
    servingsKeyboard(),
    favoritesKeyboard([{ title: 'Очень длинное название домашнего блюда с грибами и сметаной' }]),
    ...HUBS.map(id => hubKeyboard(id)),
    catalogKeyboard([{ id: '4', title: 'Очень длинное название домашнего блюда с грибами и сметаной' }])
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
  assert.deepEqual(labels, ['Поиск рецептов', 'Сохранённые']);
  assert.match(rows(recipeKeyboard({ steps: ['a', 'b'] })).flat().map(button => button.action.label).join(' '), /Сохранить/);
  assert.match(rows(recipeKeyboard({ steps: ['a', 'b'] })).flat().map(button => button.action.label).join(' '), /Поиск рецептов/);
  assert.match(rows(hubKeyboard('pick')).flat().map(button => button.action.label).join(' '), /Из того, что есть/);
  for (const id of HUBS) {
    assert.ok(hubKeyboard(id));
    assert.match(hubText(id), /\S/);
  }
});

test('у каждого раздела живые подразделы', () => {
  const ids = sectionIds();
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    const node = sectionById(id);
    assert.ok(node.title);
    assert.ok(node.short);
    assert.ok(node.short.length <= 40);
    for (const child of node.children || []) {
      const ref = typeof child === 'string' ? child : child.id;
      assert.ok(sectionById(ref), `${id} → ${ref}`);
    }
  }
});
