'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { withPromo } = require('../src/promo');
const { matchLesson, loadLessons, postsToLessons, collectLessons } = require('../src/lessons');

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
  assert.match(withLesson, /Смотрите также: мастер-класс «Медовик»/);
  assert.match(withLesson, /wall-2_2/);
  const article = withPromo('Торт.', {
    lesson: { title: 'Бисквит', url: 'https://vk.ru/@babyagaland-biskvit', kind: 'article' }
  });
  assert.match(article, /Смотрите также: статья «Бисквит»/);
  const paid = withPromo('Торт.', {
    lesson: { title: 'Медовик', url: 'https://vk.ru/wall-213938339_2', kind: 'paid' }
  });
  assert.match(paid, /Смотрите также: платный урок «Медовик»/);
  assert.match(paid, /по подписке в сообществе «Баба Яга»/);
  assert.doesNotMatch(paid, /коржи/);

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

  const fromWall = postsToLessons([
    { id: 9, text: 'Мастер-класс: медовик. Коржи на меду.' },
    { id: 10, text: 'Борщ со свеклой на обед.' },
    { id: 11, text: 'ок' }
  ], '213938339');
  assert.equal(fromWall.length, 2);
  assert.equal(fromWall[0].kind, 'masterclass');
  assert.equal(fromWall[0].url, 'https://vk.ru/wall-213938339_9');
  assert.equal(fromWall[1].kind, 'recipe');
  assert.equal(matchLesson('медовик', fromWall).url, fromWall[0].url);

  const catalog = collectLessons({
    posts: [
      {
        id: 1,
        text: 'ок',
        attachments: [{
          type: 'article',
          article: {
            id: 5,
            owner_id: -213938339,
            title: 'Сахарная Избушка',
            subtitle: 'клуб кондитеров',
            url: 'https://vk.com/@babyagaland-saharnaya-izbushka'
          }
        }]
      },
      { id: 2, donut: { is_donut: true }, text: 'Закрытый мастер-класс по медовику для своих. Секретные коржи и крем.' },
      {
        id: 3,
        donut: { is_donut: true },
        text: 'урок',
        attachments: [{ type: 'video', video: { id: 4, owner_id: -213938339, title: 'Наполеон закрытый урок', description: 'коржи' } }]
      }
    ],
    articles: [{ id: 6, owner_id: -213938339, title: 'Бисквит на желтках', url: 'https://vk.ru/@babyagaland-biskvit' }],
    videos: [{ id: 7, owner_id: -213938339, title: 'Мастер-класс: муссовый торт', description: 'урок для кондитеров' }],
    albums: [{ id: 8, owner_id: -213938339, title: 'Навигация по донам', description: 'альбом' }],
    goods: [{ id: 9, title: 'Набор форм', description: 'для торта' }],
    menu: [
      { type: 'article', title: 'Сахарная Избушка', url: 'https://vk.ru/@babyagaland-saharnaya-izbushka' },
      { type: 'app', title: 'Чужой бот', url: 'https://vk.ru/app1' }
    ]
  }, '213938339');
  const byTitle = Object.fromEntries(catalog.map(item => [item.title, item]));
  assert.equal(byTitle['Сахарная Избушка'].kind, 'article');
  assert.equal(byTitle['Сахарная Избушка'].url, 'https://vk.ru/@babyagaland-saharnaya-izbushka');
  assert.equal(catalog.filter(item => item.title === 'Сахарная Избушка').length, 1);
  assert.equal(byTitle['Бисквит на желтках'].kind, 'article');
  assert.equal(byTitle['Мастер-класс: муссовый торт'].kind, 'masterclass');
  assert.equal(byTitle['Мастер-класс: муссовый торт'].url, 'https://vk.ru/video-213938339_7');
  assert.equal(byTitle['Навигация по донам'].kind, 'album');
  assert.equal(byTitle['Набор форм'].kind, 'material');
  assert.equal(byTitle['Набор форм'].url, 'https://vk.ru/market-213938339?w=product-213938339_9');
  assert.equal(byTitle['Закрытый мастер-класс по медовику для своих'].kind, 'paid');
  assert.equal(byTitle['Закрытый мастер-класс по медовику для своих'].url, 'https://vk.ru/wall-213938339_2');
  assert.equal(byTitle['Наполеон закрытый урок'].kind, 'paid');
  assert.equal(byTitle['Наполеон закрытый урок'].url, 'https://vk.ru/wall-213938339_3');
  assert.equal(catalog.some(item => item.url.includes('video-213938339_4')), false);
  assert.equal(catalog.some(item => /Секретные коржи/.test(item.title)), false);
  assert.equal(matchLesson('медовик', catalog).kind, 'paid');
  assert.equal(catalog.some(item => item.url.includes('/app1')), false);
  assert.equal(matchLesson('бисквит желтки', catalog).url, byTitle['Бисквит на желтках'].url);
});
