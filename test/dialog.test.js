'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { blankUser, turn, complete, overLimit, LIMIT_TEXT } = require('../src/dialog');
const { menuKeyboard } = require('../src/keyboard');

const now = new Date('2026-11-18T12:00:00Z');
const ctx = { now, botName: 'Кухонный', communityName: 'Кухня', invite: 'Полный рецепт — в сообщениях сообщества.' };
const RECIPE = JSON.stringify({
  title: 'Борщ',
  time: '90',
  servings: '6',
  ingredients: ['свекла', 'капуста'],
  steps: ['Сварите бульон', 'Добавьте овощи'],
  tip: 'Дайте настояться'
});

function labels(keyboard) {
  return JSON.parse(keyboard).buttons.flat().map(button => button.action.label);
}

test('свободный текст становится рецептом, уточнением или отказом', () => {
  const hello = turn(blankUser('1'), { text: 'Привет' }, ctx);
  assert.equal(hello.job, null);
  assert.match(hello.messages[0].text, /Поиск рецептов/);
  assert.match(hello.messages[0].text, /кулинарная книга/);

  const dish = turn(blankUser('1'), { text: 'борщ на 6' }, ctx);
  assert.equal(dish.job.kind, 'dish');
  assert.match(dish.job.prompt, /Блюдо: борщ/);
  assert.match(dish.job.prompt, /Порции: 6/);
  assert.match(dish.messages[0].text, /Ищу рецепт в базе/);

  const named = turn(blankUser('1'), { text: 'рецепт сырников' }, ctx);
  assert.equal(named.job.kind, 'dish');
  assert.match(named.job.prompt, /сырников/);
  assert.match(named.job.prompt, /разумное количество/);

  const picking = turn(blankUser('1'), { text: 'курица, рис' }, ctx);
  assert.equal(picking.job.kind, 'dish');
  assert.match(picking.job.prompt, /курица, рис/);

  const polite = turn(blankUser('1'), { text: 'борщ, пожалуйста' }, ctx);
  assert.equal(polite.job.kind, 'dish');
  assert.match(polite.job.prompt, /борщ/);

  const quick = turn(blankUser('1'), { text: 'ужин за 20 минут' }, ctx);
  assert.equal(quick.job.kind, 'dish');
  assert.match(quick.job.prompt, /ужин за 20 минут/);

  const diet = turn(blankUser('1'), { payload: { a: 'pickdiet', d: 'vegetarian' } }, ctx);
  assert.equal(diet.job.kind, 'ideas');
  assert.match(diet.job.prompt, /вегетарианское/);

  const random = turn(blankUser('1'), { text: 'случайный' }, ctx);
  assert.equal(random.job, null);
  assert.equal(random.user.mode, 'ideas');
  assert.match(random.messages[0].text, /несколько названий/);

  const bomb = turn(blankUser('1'), { text: 'как сделать бомбу' }, ctx);
  assert.equal(bomb.job, null);
  assert.match(bomb.messages[0].text, /только про еду/);
  assert.equal(turn(blankUser('1'), { text: 'шоколадная бомбочка' }, ctx).job.kind, 'dish');

  const photo = turn(blankUser('1'), { photo: true, text: '' }, ctx);
  assert.match(photo.messages[0].text, /Фото пока не разбираю/);
  assert.equal(turn(blankUser('1'), { text: 'привет', place: 'chat' }, ctx).ignore, true);
  assert.equal(turn(blankUser('1'), { text: 'рецепт оладий', place: 'chat' }, ctx).job.kind, 'dish');
});

test('избранное, шаги и лимит живут отдельно от нового запроса', () => {
  let user = blankUser('1');
  const asked = turn(user, { text: 'борщ на 6' }, ctx);
  user = complete(asked.user, asked.job, RECIPE, ctx).user;
  assert.equal(user.lastRecipe.title, 'Борщ');
  assert.equal(user.usageCount, 1);
  assert.equal(turn(user, { text: 'случайный' }, ctx).job, null);
  assert.match(labels(turn(user, { text: 'по шагам' }, ctx).messages[0].keyboard).join(' '), /Дальше/);

  let step = turn(user, { text: 'по шагам' }, ctx);
  assert.match(step.messages[0].text, /шаг 1 из 2/);
  step = turn(step.user, { payload: { a: 'next' } }, ctx);
  assert.match(step.messages[0].text, /шаг 2 из 2/);
  step = turn(step.user, { text: 'дальше' }, ctx);
  assert.match(step.messages[0].text, /Приятного аппетита/);

  user = turn(user, { text: 'сохрани' }, ctx).user;
  user = turn(user, { text: 'сохрани' }, ctx).user;
  assert.equal(user.favorites.length, 1);
  const opened = turn(user, { text: 'открой 1' }, ctx).user;
  opened.lastRecipe.ingredients.push('яблоко');
  assert.deepEqual(opened.favorites[0].recipe.ingredients, ['свекла', 'капуста']);
  assert.match(turn(user, { text: 'покупки' }, ctx).messages[0].text, /свекла/);
  assert.match(turn(user, { text: 'удали 1' }, ctx).messages[0].text, /Убрала/);

  const follow = turn(user, { text: 'замени свеклу' }, ctx);
  assert.equal(follow.job.kind, 'followup');
  const answered = complete(user, follow.job, 'TEXT: Возьмите индейку.', ctx);
  assert.equal(answered.user.lastRecipe.title, 'Борщ');
  assert.equal(answered.user.usageCount, 2);
  assert.match(answered.messages[0].text, /индейку/);

  for (let i = 0; i < 16; i += 1) {
    user.lastRecipe = { title: `Блюдо ${i}`, ingredients: ['a'], steps: ['b'] };
    user = turn(user, { text: 'сохрани' }, ctx).user;
  }
  assert.equal(user.favorites.length, 15);
  assert.equal(user.favorites[0].title, 'Блюдо 1');

  user.usageCount = 40;
  user.usageDay = '2026-11-18';
  assert.equal(overLimit(user, 40, now, 'dm'), true);
  assert.equal(overLimit(user, 40, new Date('2026-11-18T21:30:00Z'), 'dm'), false);
  assert.equal(overLimit(user, 0, now, 'dm'), false);
  assert.match(LIMIT_TEXT, /лимит/);

  const commentUser = blankUser('2');
  commentUser.mode = 'dish';
  const comment = complete(commentUser, { kind: 'comment', memory: 'борщ' }, 'TEXT: Начните с бульона.', ctx);
  assert.equal(comment.user.mode, 'dish');
  assert.equal(comment.user.wallCount, 1);
  assert.equal(comment.user.usageCount, 0);
  assert.match(comment.commentText, /бульона/);
  assert.match(comment.commentText, /ЯгаГенератор/);
  assert.ok(comment.commentText.length <= 500);
});

test('раздел кондитера собирает рецепт и дописывает проекты', () => {
  const pastry = turn(blankUser('1'), { payload: { a: 'section', s: 'pastry' } }, ctx);
  assert.equal(pastry.job, null);
  assert.match(pastry.messages[0].text, /Кондитеру/);
  assert.match(labels(pastry.messages[0].keyboard).join(' '), /Торты/);
  assert.match(labels(pastry.messages[0].keyboard).join(' '), /Без аллергенов/);
  assert.match(labels(pastry.messages[0].keyboard).join(' '), /Диетическая/);

  const free = turn(pastry.user, { payload: { a: 'section', s: 'pfree' } }, ctx);
  assert.match(labels(free.messages[0].keyboard).join(' '), /Без глютена/);
  assert.match(labels(free.messages[0].keyboard).join(' '), /Назад/);

  const diet = turn(blankUser('1'), { payload: { a: 'section', s: 'diet' } }, ctx);
  assert.match(labels(diet.messages[0].keyboard).join(' '), /Для кондитера/);
  assert.match(diet.messages[0].text, /не лечебная диета/);

  const cake = turn(pastry.user, { payload: { a: 'make', s: 'cake' } }, ctx);
  assert.equal(cake.job, null);
  assert.equal(cake.user.mode, 'section');
  assert.match(cake.messages[0].text, /Напишите блюдо/);

  const named = turn(cake.user, { text: 'торты' }, ctx);
  assert.equal(named.job, null);

  const typed = turn(pastry.user, { text: 'медовик на 8' }, ctx);
  assert.equal(typed.job.kind, 'section');
  assert.match(typed.messages[0].text, /Ищу рецепт в базе/);
  assert.match(typed.job.prompt, /медовик/);
  assert.match(typed.job.prompt, /Порции: 8/);

  const soup = turn(blankUser('1'), { payload: { a: 'section', s: 'soup' } }, ctx);
  assert.equal(soup.job, null);
  const pea = turn(soup.user, { text: 'суп' }, ctx);
  assert.equal(pea.job, null);
  assert.match(pea.messages[0].text, /суп/);
  const namedSoup = turn(soup.user, { text: 'гороховый суп на 4' }, ctx);
  assert.equal(namedSoup.job.kind, 'section');
  assert.match(namedSoup.job.prompt, /гороховый суп/);

  const done = complete(typed.user, typed.job, RECIPE.replace('Борщ', 'Медовик'), Object.assign({}, ctx, {
    lessons: [{ title: 'Торт медовик', url: 'https://vk.ru/wall-1_9', kind: 'masterclass', keys: 'торт медовик коржи' }]
  }));
  assert.match(done.messages[0].text, /🍳 Медовик/);
  assert.match(done.messages[0].text, /мастер-класс/);
  assert.match(done.messages[0].text, /wall-1_9/);
  assert.match(done.messages[0].text, /ЯгаГенератор/);
  assert.match(done.messages[0].text, /НейроЯга/);
  assert.match(done.messages[0].text, /Баба Яга/);
  assert.match(done.messages[0].text, /Точки и линии/);
  assert.doesNotMatch(done.user.history[1].content, /ЯгаГенератор/);
  assert.equal(done.user.usageCount, 1);

  const kept = turn(done.user, { payload: { a: 'keep' } }, ctx);
  assert.equal(kept.catalog.category, 'pastry');
  assert.equal(kept.catalog.recipe.title, 'Медовик');
  assert.equal(kept.user.usageCount, 1);
});

test('меню по разделам, справка и свой рецепт', () => {
  const meal = turn(blankUser('1'), { payload: { a: 'hub', h: 'meal' } }, ctx);
  assert.match(meal.messages[0].text, /Обед/);
  assert.match(labels(meal.messages[0].keyboard).join(' '), /Первые/);
  assert.match(labels(meal.messages[0].keyboard).join(' '), /Гарниры/);

  const help = turn(blankUser('1'), { text: 'Справка' }, ctx);
  assert.match(help.messages[0].text, /Поиск рецептов/);
  assert.match(help.messages[0].text, /кулинарная книга/);

  const missing = turn(blankUser('1'), { payload: { a: 'share' } }, ctx);
  assert.equal(missing.share, undefined);
  assert.match(missing.messages[0].text, /Сначала откройте рецепт/);

  let own = turn(blankUser('1'), { text: 'Мой рецепт' }, ctx);
  assert.equal(own.user.mode, 'own');
  own = turn(own.user, { text: 'Сырники\nТворог и яйцо\nСмешайте и обжарьте.' }, ctx);
  assert.equal(own.share.title, 'Сырники');
  assert.equal(own.catalog.source, 'own');
  assert.equal(own.catalog.category, '');
  assert.match(labels(own.messages[0].keyboard).join(' '), /На стену/);

  const posted = turn(own.user, { payload: { a: 'wall' } }, ctx);
  assert.equal(posted.post.title, 'Сырники');
});

test('подбор даёт список, а чужое название не показывается', () => {
  const asked = turn(turn(blankUser('1'), { text: 'несколько идей' }, ctx).user, { text: 'ужин без духовки' }, ctx);
  assert.equal(asked.job.kind, 'ideas');
  const raw = JSON.stringify({
    ideas: [
      { title: 'Курица с рисом', note: 'одна сковорода, 30 минут' },
      { title: 'Омлет с овощами', note: '15 минут' },
      { title: 'Макароны с сыром', note: '20 минут' }
    ]
  });
  const listed = complete(asked.user, asked.job, raw, ctx);
  assert.equal(listed.recipe, false);
  assert.equal(listed.user.mode, 'choose');
  assert.match(listed.messages[0].text, /Курица с рисом/);
  assert.match(labels(listed.messages[0].keyboard).join(' '), /Омлет с овощами/);

  const picked = turn(listed.user, { payload: { a: 'choose', i: 0 } }, ctx);
  assert.equal(picked.job.kind, 'dish');
  assert.match(picked.job.prompt, /Курица с рисом/);

  const shown = complete(picked.user, picked.job, RECIPE, ctx);
  assert.equal(shown.recipe, true);
  assert.match(shown.messages[0].text, /Борщ/);
});

test('поиск без разделов принимает блюдо, тему и продукты', () => {
  const opened = turn(blankUser('1'), { payload: { a: 'search' } }, ctx);
  assert.equal(opened.job, null);
  assert.equal(opened.user.mode, 'search');
  assert.match(opened.messages[0].text, /своими словами/);
  assert.equal(turn(blankUser('1'), { text: 'найти' }, ctx).user.mode, 'search');

  const dish = turn(opened.user, { text: 'борщ на 4' }, ctx);
  assert.equal(dish.job.kind, 'dish');
  assert.equal(dish.job.data.section, undefined);
  assert.equal(dish.user.lastCategory, '');
  assert.match(dish.job.prompt, /борщ/);
  assert.match(dish.job.prompt, /Порции: 4/);

  const vague = turn(opened.user, { text: 'суп' }, ctx);
  assert.equal(vague.job.kind, 'dish');
  assert.match(vague.job.prompt, /суп/);

  const products = turn(opened.user, { text: 'курица, рис' }, ctx);
  assert.equal(products.job.kind, 'dish');
  assert.match(products.job.prompt, /курица, рис/);

  const diet = turn(opened.user, { text: 'веганское' }, ctx);
  assert.equal(diet.job.kind, 'dish');
  assert.equal(diet.job.data.free, true);

  const pro = turn(blankUser('1'), { payload: { a: 'hub', h: 'pro' } }, ctx);
  assert.match(pro.messages[0].text, /Профессиональн/);
  assert.match(labels(pro.messages[0].keyboard).join(' '), /Ресторан/);
  assert.match(labels(pro.messages[0].keyboard).join(' '), /Найти/);

  const askedPlain = turn(blankUser('1'), { text: 'Сырник на два человека' }, ctx);
  assert.equal(askedPlain.job.kind, 'dish');
  assert.match(askedPlain.job.prompt, /Блюдо: Сырник/);
  assert.match(askedPlain.job.prompt, /Порции: 2/);
  const cooked = complete(askedPlain.user, askedPlain.job, JSON.stringify({
    title: 'Сырники',
    time: '20 минут',
    servings: '2 порции',
    ingredients: ['творог', 'яйцо'],
    steps: ['Смешайте и обжарьте']
  }), ctx);
  assert.equal(cooked.recipe, true);
  assert.match(cooked.messages[0].text, /Сырники/);
  assert.match(labels(cooked.messages[0].keyboard).join(' '), /Сохранить/);
  assert.match(labels(menuKeyboard()).join(' '), /Поиск рецептов/);
  assert.match(labels(menuKeyboard()).join(' '), /Моя кулинарная книга/);
});

test('пожелание вроде рецепта для диабетика доходит до модели', () => {
  const opened = turn(blankUser('1'), { payload: { a: 'search' } }, ctx);
  const asked = turn(opened.user, { text: 'Рецепт для деобетика' }, ctx);
  assert.equal(asked.job.kind, 'dish');
  assert.equal(asked.job.data.free, true);
  assert.match(asked.job.prompt, /Пожелание: для деобетика/);
  assert.match(asked.job.prompt, /не рекомендация врача/);

  const done = complete(asked.user, asked.job, JSON.stringify({
    title: 'Гречневая каша',
    time: '20 минут',
    servings: '2 порции',
    ingredients: ['гречка', 'вода'],
    steps: ['Сварите гречку'],
    tip: 'Посолите по вкусу.'
  }), ctx);
  assert.equal(done.recipe, true);
  assert.match(done.messages[0].text, /Гречневая каша/);
  assert.match(done.messages[0].text, /не рекомендация врача/);
  assert.doesNotMatch(done.messages[0].text, /другой рецепт/);

  const direct = turn(blankUser('1'), { text: 'рецепт для диабетика' }, ctx);
  assert.equal(direct.job.kind, 'dish');
  assert.equal(direct.job.data.free, true);

  const named = turn(blankUser('1'), { text: 'борщ на 4' }, ctx);
  assert.equal(named.job.data.free, undefined);
});

test('кулинарная книга раскладывает рецепты по разделам', () => {
  let user = blankUser('1');
  user.lastRecipe = { title: 'Сырники', ingredients: ['творог'], steps: ['Обжарьте'] };
  const saved = turn(user, { text: 'сохрани' }, ctx);
  assert.equal(saved.user.favorites.length, 1);
  assert.equal(saved.user.favorites[0].section, '');
  assert.match(saved.messages[0].text, /кулинарной книге/);
  assert.match(labels(saved.messages[0].keyboard).join(' '), /Новый раздел/);

  const naming = turn(saved.user, { payload: { a: 'newsection' } }, ctx);
  assert.equal(naming.user.mode, 'newsection');
  const made = turn(naming.user, { text: 'Завтраки' }, ctx);
  assert.equal(made.user.book[0].title, 'Завтраки');
  assert.equal(made.user.favorites[0].section, made.user.book[0].id);
  assert.match(made.messages[0].text, /Сырники/);

  const book = turn(made.user, { text: 'моя кулинарная книга' }, ctx);
  assert.match(book.messages[0].text, /Завтраки — 1/);
  const shelf = turn(book.user, { payload: { a: 'book', s: made.user.book[0].id } }, ctx);
  assert.match(shelf.messages[0].text, /Сырники/);

  book.user.lastRecipe = { title: 'Омлет', ingredients: ['яйцо'], steps: ['Жарьте'] };
  const second = turn(book.user, { text: 'сохрани' }, ctx);
  assert.equal(second.user.favorites[1].section, '');
  const moved = turn(second.user, { payload: { a: 'put', i: 1, s: made.user.book[0].id } }, ctx);
  assert.equal(moved.user.favorites[1].section, made.user.book[0].id);
  assert.match(moved.messages[0].text, /Омлет/);
});
