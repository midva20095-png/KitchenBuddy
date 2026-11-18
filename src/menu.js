'use strict';

const { board, textButton } = require('./keyboard');
const { normalize } = require('./text');

const NODES = {};

function add(node) {
  NODES[node.id] = node;
  return node.id;
}

function branch(id, title, short, brief, parent, children) {
  return add({ id, title, short, brief, parent, children });
}

function leaf(id, title, short, brief, parent) {
  return add({ id, title, short, brief, parent, children: null });
}

branch('first', 'Первые блюда', 'Первые', 'Первое блюдо: суп, борщ, щи, бульон или солянка.', 'meal', [
  leaf('soup', 'Супы', 'Супы', 'Домашний суп на обед.', 'first'),
  leaf('borsch', 'Борщи и щи', 'Борщи и щи', 'Борщ или щи.', 'first'),
  leaf('broth', 'Бульоны', 'Бульоны', 'Прозрачный бульон.', 'first'),
  leaf('cream', 'Крем-супы', 'Крем-супы', 'Крем-суп.', 'first'),
  leaf('solyanka', 'Солянка', 'Солянка', 'Солянка.', 'first')
]);

branch('second', 'Вторые блюда', 'Вторые', 'Второе блюдо к обеду или ужину.', 'meal', [
  leaf('meat', 'Мясо', 'Мясо', 'Второе из мяса.', 'second'),
  leaf('bird', 'Птица', 'Птица', 'Второе из курицы, индейки или другой птицы.', 'second'),
  leaf('fish', 'Рыба', 'Рыба', 'Второе из рыбы.', 'second'),
  leaf('vegmain', 'Овощное', 'Овощное', 'Овощное второе блюдо.', 'second'),
  leaf('pasta', 'Паста и крупы', 'Паста и крупы', 'Паста, крупа или плотное блюдо из крупы.', 'second'),
  'side'
]);

branch('side', 'Гарниры', 'Гарниры', 'Гарнир к мясу, птице или рыбе.', 'second', [
  leaf('grain', 'Крупы', 'Крупы', 'Гарнир из крупы.', 'side'),
  leaf('potato', 'Картофель', 'Картофель', 'Гарнир из картофеля.', 'side'),
  leaf('vegside', 'Овощи', 'Овощи', 'Овощной гарнир.', 'side')
]);

branch('salad', 'Салаты', 'Салаты', 'Салат к столу.', 'meal', [
  leaf('rawsalad', 'Овощные', 'Овощные', 'Овощной салат.', 'salad'),
  leaf('warmsalad', 'Тёплые', 'Тёплые', 'Тёплый салат.', 'salad'),
  leaf('festsalad', 'Праздничные', 'Праздничные', 'Праздничный салат.', 'salad')
]);

branch('starter', 'Закуски', 'Закуски', 'Закуска к столу.', 'meal', [
  leaf('coldstart', 'Холодные', 'Холодные', 'Холодная закуска.', 'starter'),
  leaf('hotstart', 'Горячие', 'Горячие', 'Горячая закуска.', 'starter'),
  leaf('canape', 'Канапе', 'Канапе', 'Канапе или маленькая закуска.', 'starter')
]);

branch('breakfast', 'Завтраки', 'Завтраки', 'Завтрак.', 'morning', [
  leaf('kasha', 'Каши', 'Каши', 'Каша на завтрак.', 'breakfast'),
  leaf('eggs', 'Яичница', 'Яичница', 'Завтрак из яиц.', 'breakfast'),
  leaf('syrniki', 'Сырники', 'Сырники', 'Сырники или творожный завтрак.', 'breakfast'),
  leaf('sandwich', 'Бутерброды', 'Бутерброды', 'Бутерброд или тост на завтрак.', 'breakfast')
]);

branch('drink', 'Напитки', 'Напитки', 'Домашний напиток.', 'morning', [
  leaf('hotdrink', 'Чай и кофе', 'Чай и кофе', 'Горячий домашний напиток: чай, какао или кофе.', 'drink'),
  leaf('colddrink', 'Холодные', 'Холодные', 'Холодный домашний напиток.', 'drink'),
  leaf('smoothie', 'Смузи', 'Смузи', 'Смузи или густой напиток.', 'drink')
]);

branch('bake', 'Выпечка', 'Выпечка', 'Домашняя выпечка, не кондитерский торт.', 'sweetbox', [
  leaf('bread', 'Хлеб', 'Хлеб', 'Домашний хлеб или лепёшка.', 'bake'),
  leaf('pie', 'Пироги', 'Пироги', 'Пирог или пирожки.', 'bake'),
  leaf('blini', 'Блины', 'Блины', 'Блины или оладьи.', 'bake')
]);

branch('sweet', 'Десерты', 'Десерты', 'Домашний десерт, не большой торт.', 'sweetbox', [
  leaf('curd', 'Творожные', 'Творожные', 'Творожный десерт.', 'sweet'),
  leaf('fruit', 'Фруктовые', 'Фруктовые', 'Фруктовый десерт.', 'sweet'),
  leaf('choco', 'Шоколад', 'Шоколад', 'Шоколадный десерт.', 'sweet'),
  leaf('mousse', 'Мусс и желе', 'Мусс и желе', 'Мусс, желе или лёгкий десерт.', 'sweet')
]);

branch('pastry', 'Кондитеру', 'Кондитеру', 'Кондитерское изделие: торт, пирожное, печенье, крем или декор.', 'sweetbox', [
  leaf('cake', 'Торты', 'Торты', 'Домашний торт: коржи, прослойка и украшение из обычных продуктов.', 'pastry'),
  leaf('cupcake', 'Пирожные', 'Пирожные', 'Пирожное.', 'pastry'),
  leaf('cookie', 'Печенье', 'Печенье', 'Печенье.', 'pastry'),
  leaf('creamfill', 'Кремы', 'Кремы', 'Крем или начинка для торта и пирожных.', 'pastry'),
  leaf('decor', 'Декор', 'Декор', 'Украшение торта или пирожного из обычных продуктов.', 'pastry'),
  leaf('nobake', 'Без выпечки', 'Без выпечки', 'Кондитерское без духовки.', 'pastry'),
  'pfree',
  'pdiet'
]);

branch('pfree', 'Без аллергенов', 'Без аллергенов', 'Кондитерское без выбранного аллергена. Это не медицинская рекомендация.', 'pastry', [
  leaf('pf-glut', 'Без глютена', 'Без глютена', 'Кондитерское без глютена: без пшеницы, ржи и обычной пшеничной муки. Это не медицинская рекомендация.', 'pfree'),
  leaf('pf-lact', 'Без лактозы', 'Без лактозы', 'Кондитерское без молока и лактозы. Это не медицинская рекомендация.', 'pfree'),
  leaf('pf-egg', 'Без яиц', 'Без яиц', 'Кондитерское без яиц. Это не медицинская рекомендация.', 'pfree'),
  leaf('pf-nut', 'Без орехов', 'Без орехов', 'Кондитерское без орехов. Это не медицинская рекомендация.', 'pfree'),
  leaf('pf-honey', 'Без мёда', 'Без мёда', 'Кондитерское без мёда. Это не медицинская рекомендация.', 'pfree'),
  leaf('pf-soy', 'Без сои', 'Без сои', 'Кондитерское без сои. Это не медицинская рекомендация.', 'pfree')
]);

branch('pdiet', 'Диетическая', 'Диетическая', 'Кондитерское с бытовым ограничением. Это не лечебная диета и не назначение врача.', 'pastry', [
  leaf('pd-sugar', 'Без сахара', 'Без сахара', 'Кондитерское без добавленного сахара. Это не лечебная диета.', 'pdiet'),
  leaf('pd-pp', 'Полегче', 'Полегче', 'Кондитерское полегче, без медицинских обещаний и без подсчёта лечения.', 'pdiet'),
  leaf('pd-kids', 'Детское', 'Детское', 'Кондитерское для детей: мягкий вкус, без острого и алкоголя. Это не назначение врача.', 'pdiet'),
  leaf('pd-lent', 'Постное', 'Постное', 'Постное кондитерское без яиц и молочных продуктов.', 'pdiet')
]);

branch('allergen', 'Без аллергенов', 'Аллергены', 'Блюдо без выбранного аллергена. Для тортов откройте «Кондитеру». Это не медицинская рекомендация.', 'pick', [
  leaf('a-glut', 'Без глютена', 'Без глютена', 'Блюдо без глютена: без пшеницы, ржи и обычной пшеничной муки. Это не медицинская рекомендация.', 'allergen'),
  leaf('a-lact', 'Без лактозы', 'Без лактозы', 'Блюдо без молока и лактозы. Это не медицинская рекомендация.', 'allergen'),
  leaf('a-egg', 'Без яиц', 'Без яиц', 'Блюдо без яиц. Это не медицинская рекомендация.', 'allergen'),
  leaf('a-nut', 'Без орехов', 'Без орехов', 'Блюдо без орехов. Это не медицинская рекомендация.', 'allergen'),
  leaf('a-honey', 'Без мёда', 'Без мёда', 'Блюдо без мёда. Это не медицинская рекомендация.', 'allergen'),
  leaf('a-soy', 'Без сои', 'Без сои', 'Блюдо без сои. Это не медицинская рекомендация.', 'allergen')
]);

branch('diet', 'Диетическое', 'Диета', 'Обычная домашняя еда с бытовым ограничением. Это не лечебная диета и не назначение врача. Для тортов откройте «Для кондитера».', 'pick', [
  leaf('d-veg', 'Вегетарианское', 'Вегетарианское', 'Вегетарианское блюдо без мяса и рыбы. Это не лечебная диета.', 'diet'),
  leaf('d-sugar', 'Без сахара', 'Без сахара', 'Блюдо без добавленного сахара. Это не лечебная диета.', 'diet'),
  leaf('d-kids', 'Детское', 'Детское', 'Детское блюдо: мягкий вкус, без острого и алкоголя. Это не назначение врача.', 'diet'),
  leaf('d-budget', 'Бюджетное', 'Бюджетное', 'Бюджетное блюдо из недорогих продуктов.', 'diet'),
  leaf('d-glut', 'Без глютена', 'Без глютена', 'Блюдо без глютена. Это не лечебная диета.', 'diet'),
  leaf('d-protein', 'Больше белка', 'Больше белка', 'Блюдо с заметной белковой частью, без медицинских обещаний.', 'diet'),
  leaf('d-pp', 'Полегче', 'Полегче', 'Блюдо полегче в бытовом смысле, без подсчёта лечения и медицинских обещаний.', 'diet'),
  { id: 'pdiet', label: 'Для кондитера' }
]);

function childRef(entry) {
  if (typeof entry === 'string') return { id: entry, label: '' };
  return { id: entry.id, label: entry.label || '' };
}

function sectionById(id) {
  return NODES[id] || null;
}

function sectionAlias(text) {
  const value = normalize(text);
  if (!value || value.length > 40) return '';
  const hits = Object.values(NODES).filter(node => {
    return normalize(node.short) === value || normalize(node.title) === value;
  });
  if (hits.length !== 1) return '';
  return hits[0].id;
}

function childButton(entry) {
  const ref = childRef(entry);
  const node = NODES[ref.id];
  if (!node) return textButton('Меню', { a: 'menu' }, 'secondary');
  const label = ref.label || node.short || node.title;
  return textButton(label, { a: 'section', s: node.id }, 'primary');
}

function backButton(node) {
  const hubs = new Set(['meal', 'morning', 'sweetbox', 'pick', 'mine']);
  if (!node.parent || node.parent === 'menu') return textButton('В меню', { a: 'menu' }, 'secondary');
  const payload = hubs.has(node.parent) ? { a: 'hub', h: node.parent } : { a: 'section', s: node.parent };
  return textButton('Назад', payload, 'secondary');
}

function sectionKeyboard(id) {
  const node = NODES[id];
  if (!node) return null;
  const rows = [];
  const children = node.children || [];
  for (let i = 0; i < children.length; i += 2) {
    const row = [childButton(children[i])];
    if (children[i + 1]) row.push(childButton(children[i + 1]));
    rows.push(row);
  }
  rows.push([backButton(node)]);
  return board(rows);
}

function sectionText(id) {
  const node = NODES[id];
  if (!node) return 'Такого раздела нет.';
  const wait = node.children
    ? 'Выберите подраздел и напишите конкретное блюдо. Пока названия нет, поиск не начинается.'
    : 'Напишите конкретное блюдо: название и, если нужно, порции. Пока названия нет, поиск не начинается.';
  return [`${node.title}.`, node.brief, '', wait].join('\n');
}

function sectionIds() {
  return Object.keys(NODES);
}

function sectionGuess(text) {
  const words = normalize(text).split(/[^a-zа-я0-9]+/).filter(word => word.length >= 4);
  if (!words.length) return '';
  let best = '';
  let score = 0;
  for (const node of Object.values(NODES)) {
    const title = normalize(`${node.title} ${node.short}`);
    let next = 0;
    for (const word of words) {
      if (title.includes(word) || title.includes(word.slice(0, 5))) next += word.length + (node.children ? 0 : 3);
    }
    if (next > score) {
      score = next;
      best = node.id;
    }
  }
  return score >= 4 ? best : '';
}

function familyIds(id) {
  const node = sectionById(id);
  if (!node) return [];
  const ids = new Set([id]);
  let cursor = node;
  const seen = new Set();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    ids.add(cursor.id);
    cursor = cursor.parent ? sectionById(cursor.parent) : null;
  }
  for (const other of Object.values(NODES)) {
    if (node.parent && sectionById(node.parent) && other.parent === node.parent) ids.add(other.id);
    let walk = other;
    const guard = new Set();
    while (walk && !guard.has(walk.id)) {
      if (walk.id === id) ids.add(other.id);
      guard.add(walk.id);
      walk = walk.parent ? sectionById(walk.parent) : null;
    }
  }
  return [...ids];
}

module.exports = {
  sectionById,
  sectionAlias,
  sectionGuess,
  familyIds,
  sectionKeyboard,
  sectionText,
  sectionIds
};
