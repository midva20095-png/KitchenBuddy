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
    [textButton('Обед', { a: 'hub', h: 'meal' }, 'primary'), textButton('Завтрак', { a: 'hub', h: 'morning' }, 'primary')],
    [textButton('Сладкое', { a: 'hub', h: 'sweetbox' }, 'primary'), textButton('Подбор', { a: 'hub', h: 'pick' }, 'secondary')],
    [textButton('Мои рецепты', { a: 'hub', h: 'mine' }, 'positive'), textButton('Справка', { a: 'help' }, 'secondary')]
  ]);
}

function hubKeyboard(id) {
  const menu = textButton('В меню', { a: 'menu' }, 'secondary');
  if (id === 'meal') {
    return board([
      [textButton('Первые', { a: 'section', s: 'first' }, 'primary'), textButton('Вторые', { a: 'section', s: 'second' }, 'primary')],
      [textButton('Салаты', { a: 'section', s: 'salad' }, 'primary'), textButton('Закуски', { a: 'section', s: 'starter' }, 'primary')],
      [textButton('Гарниры', { a: 'section', s: 'side' }, 'primary'), menu]
    ]);
  }
  if (id === 'morning') {
    return board([
      [textButton('Завтраки', { a: 'section', s: 'breakfast' }, 'primary'), textButton('Напитки', { a: 'section', s: 'drink' }, 'primary')],
      [menu]
    ]);
  }
  if (id === 'sweetbox') {
    return board([
      [textButton('Выпечка', { a: 'section', s: 'bake' }, 'primary'), textButton('Десерты', { a: 'section', s: 'sweet' }, 'primary')],
      [textButton('Кондитеру', { a: 'section', s: 'pastry' }, 'primary'), menu]
    ]);
  }
  if (id === 'pick') {
    return board([
      [textButton('Из того, что есть', { a: 'ingredients' }, 'positive'), textButton('Быстрый ужин', { a: 'quick' }, 'positive')],
      [textButton('Случайное блюдо', { a: 'random' }, 'secondary'), textButton('Без аллергенов', { a: 'section', s: 'allergen' }, 'secondary')],
      [textButton('Диетическое', { a: 'section', s: 'diet' }, 'secondary'), menu]
    ]);
  }
  if (id === 'mine') {
    return board([
      [textButton('Избранное', { a: 'favorites' }, 'primary'), textButton('Мой рецепт', { a: 'myrecipe' }, 'positive')],
      [textButton('Поделиться', { a: 'share' }, 'primary'), menu]
    ]);
  }
  return null;
}

function hubText(id) {
  const texts = {
    meal: 'Обед.\nПервые и вторые блюда, салаты, закуски и гарниры. Выберите кнопку или напишите блюдо, например «борщ на 4».',
    morning: 'Завтрак.\nКаши, яичница, сырники и напитки. Напишите своё, например «овсянка на 2».',
    sweetbox: 'Сладкое.\nДомашняя выпечка, десерты и отдельно раздел для кондитера: торты, кремы, без аллергенов и диетическая.',
    pick: 'Подбор.\n«Из того, что есть» — блюдо из продуктов дома. «Быстрый ужин» — за несколько минут. «Случайное блюдо» — идея. «Без аллергенов» и «Диетическое» — бытовые ограничения, не назначение врача.',
    mine: 'Мои рецепты.\n«Избранное» — то, что вы сохранили. «Мой рецепт» — пришлите свой текст. «Поделиться» — отправить открытый рецепт друзьям или на стену сообщества.'
  };
  return texts[id] || '';
}

function hubByText(text) {
  const value = String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  const map = {
    обед: 'meal',
    завтрак: 'morning',
    сладкое: 'sweetbox',
    подбор: 'pick',
    'мои рецепты': 'mine'
  };
  return map[value] || '';
}

function recipeKeyboard(recipe) {
  const steps = recipe && Array.isArray(recipe.steps) && recipe.steps.length > 1;
  const rows = [[
    textButton('В избранное', { a: 'save' }, 'positive'),
    textButton('Список покупок', { a: 'shop' }, 'primary')
  ]];
  if (steps) {
    rows.push([
      textButton('Готовить по шагам', { a: 'steps' }, 'primary'),
      textButton('Другой рецепт', { a: 'another' }, 'secondary')
    ]);
  } else {
    rows.push([textButton('Другой рецепт', { a: 'another' }, 'secondary')]);
  }
  rows.push([
    textButton('Поделиться', { a: 'share' }, 'primary'),
    textButton('Мой рецепт', { a: 'myrecipe' }, 'positive')
  ]);
  rows.push([textButton('В меню', { a: 'menu' }, 'secondary')]);
  return board(rows);
}

function shareKeyboard() {
  return board([
    [textButton('На стену', { a: 'wall' }, 'positive'), textButton('В меню', { a: 'menu' }, 'secondary')]
  ]);
}

function servingsKeyboard() {
  return board([
    [
      textButton('1 порция', { a: 'servings', n: 1 }),
      textButton('2 порции', { a: 'servings', n: 2 }, 'primary'),
      textButton('4 порции', { a: 'servings', n: 4 }),
      textButton('6 порций', { a: 'servings', n: 6 })
    ],
    [textButton('Как в рецепте', { a: 'servings', n: 0 }, 'secondary'), textButton('В меню', { a: 'menu' }, 'secondary')]
  ]);
}

function minutesKeyboard() {
  return board([
    [textButton('15 мин', { a: 'minutes', n: 15 }), textButton('20 мин', { a: 'minutes', n: 20 }, 'primary')],
    [textButton('30 мин', { a: 'minutes', n: 30 }), textButton('45 мин', { a: 'minutes', n: 45 })],
    [textButton('В меню', { a: 'menu' }, 'secondary')]
  ]);
}

function dietKeyboard() {
  return board([
    [textButton('Вегетарианское', { a: 'pickdiet', d: 'vegetarian' }, 'primary'), textButton('Без сахара', { a: 'pickdiet', d: 'nosugar' })],
    [textButton('Детское', { a: 'pickdiet', d: 'kids' }), textButton('Бюджетное', { a: 'pickdiet', d: 'budget' }, 'positive')],
    [textButton('Без глютена', { a: 'pickdiet', d: 'nogluten' }), textButton('Больше белка', { a: 'pickdiet', d: 'protein' })],
    [textButton('В меню', { a: 'menu' }, 'secondary')]
  ]);
}

function stepsKeyboard(last) {
  return board([
    last
      ? [textButton('С начала', { a: 'steps' }, 'primary'), textButton('В меню', { a: 'menu' }, 'secondary')]
      : [textButton('Дальше', { a: 'next' }, 'primary'), textButton('В меню', { a: 'menu' }, 'secondary')],
    [textButton('Список покупок', { a: 'shop' }, 'secondary'), textButton('В избранное', { a: 'save' }, 'positive')],
    [textButton('Поделиться', { a: 'share' }, 'primary')]
  ]);
}

function favoritesKeyboard(list) {
  const rows = (list || []).slice(0, 5).map((item, index) => [
    textButton(`${index + 1}. ${item.title || 'Рецепт'}`, { a: 'open', i: index }, 'primary')
  ]);
  rows.push([textButton('В меню', { a: 'menu' }, 'secondary')]);
  return board(rows);
}

function backKeyboard() {
  return board([[textButton('В меню', { a: 'menu' }, 'secondary')]]);
}

module.exports = {
  fitLabel,
  textButton,
  board,
  menuKeyboard,
  hubKeyboard,
  hubText,
  hubByText,
  shareKeyboard,
  recipeKeyboard,
  servingsKeyboard,
  minutesKeyboard,
  dietKeyboard,
  stepsKeyboard,
  favoritesKeyboard,
  backKeyboard
};
