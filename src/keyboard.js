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
    [textButton('Найти', { a: 'search' }, 'positive')],
    [textButton('Обед', { a: 'hub', h: 'meal' }, 'primary'), textButton('Завтрак', { a: 'hub', h: 'morning' }, 'primary')],
    [textButton('Сладкое', { a: 'hub', h: 'sweetbox' }, 'primary'), textButton('Кухни', { a: 'hub', h: 'world' }, 'primary')],
    [textButton('Диета', { a: 'hub', h: 'dietbox' }, 'primary'), textButton('Профи', { a: 'hub', h: 'pro' }, 'primary')],
    [textButton('Подбор', { a: 'hub', h: 'pick' }, 'secondary'), textButton('Заготовки', { a: 'hub', h: 'pantry' }, 'secondary')],
    [textButton('Праздник', { a: 'hub', h: 'feast' }, 'secondary'), textButton('Мои рецепты', { a: 'hub', h: 'mine' }, 'positive')],
    [textButton('Справка', { a: 'help' }, 'secondary')]
  ]);
}

function findButton() {
  return textButton('Найти', { a: 'search' }, 'positive');
}

function hubKeyboard(id) {
  const menu = textButton('В меню', { a: 'menu' }, 'secondary');
  const find = findButton();
  if (id === 'meal') {
    return board([
      [textButton('Первые', { a: 'section', s: 'first' }, 'primary'), textButton('Вторые', { a: 'section', s: 'second' }, 'primary')],
      [textButton('Салаты', { a: 'section', s: 'salad' }, 'primary'), textButton('Закуски', { a: 'section', s: 'starter' }, 'primary')],
      [textButton('Гарниры', { a: 'section', s: 'side' }, 'primary'), textButton('Соусы', { a: 'section', s: 'homesauce' }, 'primary')],
      [textButton('Гриль', { a: 'section', s: 'homegrill' }, 'primary'), find],
      [menu]
    ]);
  }
  if (id === 'morning') {
    return board([
      [textButton('Завтраки', { a: 'section', s: 'breakfast' }, 'primary'), textButton('Напитки', { a: 'section', s: 'drink' }, 'primary')],
      [textButton('Бранч', { a: 'section', s: 'brunch' }, 'primary'), find],
      [menu]
    ]);
  }
  if (id === 'sweetbox') {
    return board([
      [textButton('Выпечка', { a: 'section', s: 'bake' }, 'primary'), textButton('Десерты', { a: 'section', s: 'sweet' }, 'primary')],
      [textButton('Кондитеру', { a: 'section', s: 'pastry' }, 'primary'), textButton('Мороженое', { a: 'section', s: 'ice' }, 'primary')],
      [textButton('Конфеты', { a: 'section', s: 'candy' }, 'primary'), find],
      [menu]
    ]);
  }
  if (id === 'pick') {
    return board([
      [textButton('Из того, что есть', { a: 'ingredients' }, 'positive'), textButton('Быстрый ужин', { a: 'quick' }, 'positive')],
      [textButton('Несколько идей', { a: 'random' }, 'secondary'), textButton('Без аллергенов', { a: 'section', s: 'allergen' }, 'secondary')],
      [textButton('Диетическое', { a: 'section', s: 'diet' }, 'secondary'), textButton('Техника', { a: 'section', s: 'gear' }, 'secondary')],
      [find, menu]
    ]);
  }
  if (id === 'mine') {
    return board([
      [textButton('Избранное', { a: 'favorites' }, 'primary'), textButton('Моя база', { a: 'base' }, 'primary')],
      [textButton('Мой рецепт', { a: 'myrecipe' }, 'positive'), textButton('Поделиться', { a: 'share' }, 'primary')],
      [find, menu]
    ]);
  }
  if (id === 'world') {
    return board([
      [textButton('Русская', { a: 'section', s: 'rus' }, 'primary'), textButton('Кавказ', { a: 'section', s: 'cauc' }, 'primary')],
      [textButton('Азия', { a: 'section', s: 'asia' }, 'primary'), textButton('Европа', { a: 'section', s: 'eu' }, 'primary')],
      [textButton('Восток', { a: 'section', s: 'east' }, 'primary'), textButton('Америка', { a: 'section', s: 'amer' }, 'primary')],
      [textButton('Средиземноморье', { a: 'section', s: 'med' }, 'primary'), find],
      [menu]
    ]);
  }
  if (id === 'pro') {
    return board([
      [textButton('Ресторан', { a: 'section', s: 'restaurant' }, 'primary'), textButton('Банкет', { a: 'section', s: 'banquet' }, 'primary')],
      [textButton('Соусы цеха', { a: 'section', s: 'sauce' }, 'primary'), textButton('Заготовки цеха', { a: 'section', s: 'prep' }, 'primary')],
      [textButton('Подача', { a: 'section', s: 'plate' }, 'primary'), textButton('Гриль зала', { a: 'section', s: 'grill' }, 'primary')],
      [textButton('Кафе', { a: 'section', s: 'cafe' }, 'primary'), textButton('Кондитеру', { a: 'section', s: 'pastry' }, 'primary')],
      [find, menu]
    ]);
  }
  if (id === 'dietbox') {
    return board([
      [textButton('Диетическое', { a: 'section', s: 'diet' }, 'primary'), textButton('Без аллергенов', { a: 'section', s: 'allergen' }, 'secondary')],
      [textButton('Веганское', { a: 'section', s: 'd-vegan' }, 'primary'), textButton('Постная еда', { a: 'section', s: 'd-lent' }, 'primary')],
      [textButton('Халяль', { a: 'section', s: 'd-halal' }, 'secondary'), textButton('Полегче', { a: 'section', s: 'd-pp' }, 'secondary')],
      [find, menu]
    ]);
  }
  if (id === 'pantry') {
    return board([
      [textButton('Соленья', { a: 'section', s: 'salt' }, 'primary'), textButton('Варенье', { a: 'section', s: 'jam' }, 'primary')],
      [textButton('Квашеное', { a: 'section', s: 'ferment' }, 'primary'), textButton('Маринады', { a: 'section', s: 'marinate' }, 'primary')],
      [textButton('Заморозка', { a: 'section', s: 'freeze' }, 'primary'), textButton('Сушка', { a: 'section', s: 'dry' }, 'primary')],
      [find, menu]
    ]);
  }
  if (id === 'feast') {
    return board([
      [textButton('Новый год', { a: 'section', s: 'ny' }, 'primary'), textButton('Пасха', { a: 'section', s: 'easter' }, 'primary')],
      [textButton('День рождения', { a: 'section', s: 'birth' }, 'primary'), textButton('Пикник', { a: 'section', s: 'picnic' }, 'primary')],
      [textButton('Свадьба', { a: 'section', s: 'wedding' }, 'primary'), textButton('Масленица', { a: 'section', s: 'maslen' }, 'primary')],
      [textButton('Детский праздник', { a: 'section', s: 'kidsfest' }, 'primary'), find],
      [menu]
    ]);
  }
  return null;
}

function hubText(id) {
  const texts = {
    meal: 'Обед. Напишите блюдо или выберите раздел.',
    morning: 'Завтрак. Напишите блюдо или выберите раздел.',
    sweetbox: 'Сладкое. Напишите блюдо или выберите раздел.',
    pick: 'Подбор. Сначала несколько названий, рецепт после выбора.',
    mine: 'Мои рецепты.',
    world: 'Кухни мира. Напишите блюдо или выберите кухню.',
    pro: 'Профессиональная кухня: ресторан, банкет, цех и подача. Продукты обычные.',
    dietbox: 'Диета. Это бытовые ограничения, не назначение врача. Напишите блюдо или выберите раздел.',
    pantry: 'Заготовки: соленья, варенье, квашеное, маринады, заморозка и сушка.',
    feast: 'Праздничный стол. Напишите блюдо или выберите повод.'
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
    'мои рецепты': 'mine',
    кухни: 'world',
    'кухни мира': 'world',
    профи: 'pro',
    профессиональное: 'pro',
    диета: 'dietbox',
    заготовки: 'pantry',
    праздник: 'feast'
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
    textButton('В базу', { a: 'keep' }, 'positive'),
    textButton('Поделиться', { a: 'share' }, 'primary')
  ]);
  rows.push([textButton('Мой рецепт', { a: 'myrecipe' }, 'secondary')]);
  rows.push([textButton('Найти', { a: 'search' }, 'positive'), textButton('В меню', { a: 'menu' }, 'secondary')]);
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

function catalogKeyboard(rows) {
  const list = (rows || []).filter(row => row && row.id).slice(0, 9);
  const buttons = list.map(row => [
    textButton(row.title || 'Рецепт', { a: 'openbase', id: String(row.id) }, 'primary')
  ]);
  buttons.push([textButton('В меню', { a: 'menu' }, 'secondary')]);
  return board(buttons);
}

function favoritesKeyboard(list) {
  const rows = (list || []).slice(0, 5).map((item, index) => [
    textButton(`${index + 1}. ${item.title || 'Рецепт'}`, { a: 'open', i: index }, 'primary')
  ]);
  rows.push([textButton('В меню', { a: 'menu' }, 'secondary')]);
  return board(rows);
}

function ideaKeyboard(ideas) {
  const rows = (ideas || []).slice(0, 5).map((item, index) => [
    textButton(`${index + 1}. ${item.title}`, { a: 'choose', i: index }, 'primary')
  ]);
  rows.push([textButton('В меню', { a: 'menu' }, 'secondary')]);
  return board(rows);
}

function searchKeyboard() {
  return board([[textButton('В меню', { a: 'menu' }, 'secondary')]]);
}

function backKeyboard() {
  return board([[textButton('Найти', { a: 'search' }, 'positive'), textButton('В меню', { a: 'menu' }, 'secondary')]]);
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
  catalogKeyboard,
  favoritesKeyboard,
  ideaKeyboard,
  backKeyboard,
  searchKeyboard
};
