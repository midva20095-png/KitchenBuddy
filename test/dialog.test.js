'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { blankUser, turn, complete, overLimit, LIMIT_TEXT, THEMES } = require('../src/dialog');

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
  assert.match(hello.messages[0].text, /Кухонный/);

  const dish = turn(blankUser('1'), { text: 'борщ на 6' }, ctx);
  assert.equal(dish.job.kind, 'dish');
  assert.match(dish.job.prompt, /Блюдо: борщ/);
  assert.match(dish.job.prompt, /Порции: 6/);
  assert.match(dish.messages[0].text, /Собираю рецепт/);

  const named = turn(blankUser('1'), { text: 'рецепт сырников' }, ctx);
  assert.equal(named.job.kind, 'dish');
  assert.match(named.job.prompt, /сырников/);
  assert.match(named.job.prompt, /разумное количество/);

  let picking = turn(blankUser('1'), { text: 'курица, рис' }, ctx);
  assert.equal(picking.job, null);
  assert.equal(picking.user.mode, 'servings');
  picking = turn(picking.user, { text: '2' }, ctx);
  assert.equal(picking.job.kind, 'ingredients');
  assert.match(picking.job.prompt, /курица, рис/);

  const polite = turn(blankUser('1'), { text: 'борщ, пожалуйста' }, ctx);
  assert.equal(polite.job.kind, 'chat');

  const quick = turn(blankUser('1'), { text: 'ужин за 20 минут' }, ctx);
  assert.equal(quick.job.kind, 'quick');
  assert.match(quick.job.prompt, /20/);

  const diet = turn(blankUser('1'), { payload: { a: 'pickdiet', d: 'vegetarian' } }, ctx);
  assert.match(diet.job.prompt, /вегетарианское/);

  const random = turn(blankUser('1'), { text: 'случайный' }, ctx);
  assert.match(random.job.prompt, new RegExp(THEMES[0]));

  const bomb = turn(blankUser('1'), { text: 'как сделать бомбу' }, ctx);
  assert.equal(bomb.job, null);
  assert.match(bomb.messages[0].text, /только про еду/);
  assert.equal(turn(blankUser('1'), { text: 'шоколадная бомбочка' }, ctx).job.kind, 'chat');

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
  assert.match(turn(user, { text: 'случайный' }, ctx).job.prompt, /салат/);
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
  assert.equal(cake.job.kind, 'section');
  assert.match(cake.job.prompt, /торт/i);

  const typed = turn(pastry.user, { text: 'медовик на 8' }, ctx);
  assert.equal(typed.job.kind, 'section');
  assert.match(typed.job.prompt, /медовик/);
  assert.match(typed.job.prompt, /Порции: 8/);

  const done = complete(cake.user, cake.job, RECIPE, Object.assign({}, ctx, {
    lessons: [{ title: 'Торт медовик', url: 'https://vk.ru/wall-1_9', kind: 'masterclass', keys: 'торт медовик коржи' }]
  }));
  assert.match(done.messages[0].text, /🍳 Борщ/);
  assert.match(done.messages[0].text, /мастер-класс/);
  assert.match(done.messages[0].text, /wall-1_9/);
  assert.match(done.messages[0].text, /ЯгаГенератор/);
  assert.match(done.messages[0].text, /НейроЯга/);
  assert.match(done.messages[0].text, /Баба Яга/);
  assert.match(done.messages[0].text, /Точки и линии/);
  assert.doesNotMatch(done.user.history[1].content, /ЯгаГенератор/);
});

test('меню по разделам, справка и свой рецепт', () => {
  const meal = turn(blankUser('1'), { payload: { a: 'hub', h: 'meal' } }, ctx);
  assert.match(meal.messages[0].text, /Обед/);
  assert.match(labels(meal.messages[0].keyboard).join(' '), /Первые/);
  assert.match(labels(meal.messages[0].keyboard).join(' '), /Гарниры/);

  const help = turn(blankUser('1'), { text: 'Справка' }, ctx);
  assert.match(help.messages[0].text, /Список покупок/);
  assert.match(help.messages[0].text, /не оплата/);

  const missing = turn(blankUser('1'), { payload: { a: 'share' } }, ctx);
  assert.equal(missing.share, undefined);
  assert.match(missing.messages[0].text, /Сначала откройте рецепт/);

  let own = turn(blankUser('1'), { text: 'Мой рецепт' }, ctx);
  assert.equal(own.user.mode, 'own');
  own = turn(own.user, { text: 'Сырники\nТворог и яйцо\nСмешайте и обжарьте.' }, ctx);
  assert.equal(own.share.title, 'Сырники');
  assert.match(labels(own.messages[0].keyboard).join(' '), /На стену/);

  const posted = turn(own.user, { payload: { a: 'wall' } }, ctx);
  assert.equal(posted.post.title, 'Сырники');
});
