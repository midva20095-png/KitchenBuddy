'use strict';

function fitLabel(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length <= 40 ? value : value.slice(0, 39) + '…';
}

function textButton(label, payload, color) {
  return {
    action: {
      type: 'text',
      label: fitLabel(label),
      payload: JSON.stringify(payload || {})
    },
    color: color || 'secondary'
  };
}

function board(rows) {
  const buttons = (rows || []).slice(0, 10).map(row => (row || []).slice(0, 4));
  return JSON.stringify({ one_time: false, inline: false, buttons });
}

function menuKeyboard() {
  return board([
    [textButton('Что приготовить', { a: 'dish' }, 'primary'), textButton('Из продуктов', { a: 'ingredients' }, 'primary')],
    [textButton('Быстрый ужин', { a: 'quick' }, 'positive'), textButton('По диете', { a: 'diet' }, 'positive')],
    [textButton('Случайный', { a: 'random' }, 'secondary'), textButton('Избранное', { a: 'favorites' }, 'secondary')],
    [textButton('Помощь', { a: 'help' }, 'secondary')]
  ]);
}

function recipeKeyboard(recipe) {
  const steps = recipe && Array.isArray(recipe.steps) && recipe.steps.length > 1;
  const rows = [[
    textButton('В избранное', { a: 'save' }, 'positive'),
    textButton('Покупки', { a: 'shop' }, 'primary')
  ]];
  if (steps) {
    rows.push([
      textButton('По шагам', { a: 'steps' }, 'primary'),
      textButton('Ещё вариант', { a: 'another' }, 'secondary')
    ]);
    rows.push([textButton('Меню', { a: 'menu' }, 'secondary')]);
  } else {
    rows.push([
      textButton('Ещё вариант', { a: 'another' }, 'secondary'),
      textButton('Меню', { a: 'menu' }, 'secondary')
    ]);
  }
  return board(rows);
}

function servingsKeyboard() {
  return board([
    [
      textButton('1', { a: 'servings', n: 1 }),
      textButton('2', { a: 'servings', n: 2 }, 'primary'),
      textButton('4', { a: 'servings', n: 4 }),
      textButton('6', { a: 'servings', n: 6 })
    ],
    [textButton('Как есть', { a: 'servings', n: 0 }, 'secondary'), textButton('Меню', { a: 'menu' }, 'secondary')]
  ]);
}

function minutesKeyboard() {
  return board([
    [textButton('15 мин', { a: 'minutes', n: 15 }), textButton('20 мин', { a: 'minutes', n: 20 }, 'primary')],
    [textButton('30 мин', { a: 'minutes', n: 30 }), textButton('45 мин', { a: 'minutes', n: 45 })],
    [textButton('Меню', { a: 'menu' }, 'secondary')]
  ]);
}

function dietKeyboard() {
  return board([
    [textButton('Вегетарианское', { a: 'pickdiet', d: 'vegetarian' }, 'primary'), textButton('Без сахара', { a: 'pickdiet', d: 'nosugar' })],
    [textButton('Детское', { a: 'pickdiet', d: 'kids' }), textButton('Бюджетное', { a: 'pickdiet', d: 'budget' }, 'positive')],
    [textButton('Без глютена', { a: 'pickdiet', d: 'nogluten' }), textButton('Больше белка', { a: 'pickdiet', d: 'protein' })],
    [textButton('Меню', { a: 'menu' }, 'secondary')]
  ]);
}

function stepsKeyboard(last) {
  return board([
    last
      ? [textButton('Сначала', { a: 'steps' }, 'primary'), textButton('Меню', { a: 'menu' }, 'secondary')]
      : [textButton('Дальше', { a: 'next' }, 'primary'), textButton('Меню', { a: 'menu' }, 'secondary')],
    [textButton('Покупки', { a: 'shop' }, 'secondary'), textButton('В избранное', { a: 'save' }, 'positive')]
  ]);
}

function favoritesKeyboard(list) {
  const rows = (list || []).slice(0, 5).map((item, index) => [
    textButton(`${index + 1}. ${item.title || 'Рецепт'}`, { a: 'open', i: index }, 'primary')
  ]);
  rows.push([textButton('Меню', { a: 'menu' }, 'secondary')]);
  return board(rows);
}

function backKeyboard() {
  return board([[textButton('Меню', { a: 'menu' }, 'secondary')]]);
}

module.exports = {
  fitLabel,
  menuKeyboard,
  recipeKeyboard,
  servingsKeyboard,
  minutesKeyboard,
  dietKeyboard,
  stepsKeyboard,
  favoritesKeyboard,
  backKeyboard
};
