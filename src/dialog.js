'use strict';

const {
  menuKeyboard,
  hubKeyboard,
  hubText,
  shareKeyboard,
  recipeKeyboard,
  servingsKeyboard,
  minutesKeyboard,
  dietKeyboard,
  stepsKeyboard,
  bookKeyboard,
  bookListKeyboard,
  putKeyboard,
  bookBackKeyboard,
  publicKeyboard,
  publicListKeyboard,
  usePublicList,
  ideaKeyboard,
  backKeyboard,
  searchKeyboard
} = require('./keyboard');
const { buildUserPrompt } = require('./prompt');
const { parseRecipe, parseIdeas, formatIdeas, asPlain, formatRecipe, formatShopping, formatStep, commentBody } = require('./recipe');
const { normalize, clip, moscowDay } = require('./text');
const { blockedReason } = require('./guard');
const { sectionById, sectionAlias, sectionKeyboard, sectionText } = require('./menu');
const { withPromo } = require('./promo');
const { matchLesson } = require('./lessons');

const DIETS = {
  vegetarian: 'вегетарианское, без мяса и рыбы',
  vegan: 'веганское, без мяса, рыбы, яиц и молока',
  lent: 'постное, без мяса, рыбы, яиц и молочных продуктов',
  pesc: 'без мяса, рыбу и морепродукты можно',
  halal: 'халяль: без свинины и алкоголя',
  kosher: 'без свинины и без смешивания мяса с молоком в одном блюде',
  raw: 'без плиты и духовки, продукты остаются сырыми',
  dairyfree: 'без молока и молочных продуктов',
  nosugar: 'без добавленного сахара',
  kids: 'детское, мягкий вкус, без острого и алкоголя',
  budget: 'бюджетное, недорогие продукты',
  nogluten: 'без глютена: без пшеницы, ржи и обычной муки',
  protein: 'с заметной белковой частью, без медицинских обещаний'
};

const DIET_WORDS = [
  ['вегетар', 'vegetarian'],
  ['веган', 'vegan'],
  ['пескетар', 'pesc'],
  ['халял', 'halal'],
  ['кошерн', 'kosher'],
  ['сыроед', 'raw'],
  ['без молока', 'dairyfree'],
  ['без молоч', 'dairyfree'],
  ['постн', 'lent'],
  ['без сахара', 'nosugar'],
  ['детск', 'kids'],
  ['бюджет', 'budget'],
  ['глютен', 'nogluten'],
  ['белк', 'protein']
];

const GENERIC = new Set([
  'суп', 'супы', 'первое', 'первые', 'второе', 'вторые', 'салат', 'салаты',
  'закуска', 'закуски', 'гарнир', 'гарниры', 'завтрак', 'завтраки', 'напиток', 'напитки',
  'выпечка', 'десерт', 'десерты', 'торт', 'торты', 'мясо', 'рыба', 'птица', 'каша', 'каши',
  'обед', 'ужин', 'сладкое', 'рецепт', 'блюдо', 'подбор', 'идея', 'идеи', 'кондитеру',
  'домашний', 'домашняя', 'домашнее', 'простой', 'простая', 'простое', 'обычный', 'обычная',
  'вкусный', 'вкусная', 'любой', 'любая', 'кухни', 'профи', 'заготовки', 'праздник'
]);

const THEME = new Set([
  'легкий', 'легкая', 'легкое', 'сытный', 'сытная', 'сытное', 'быстрый', 'быстрая', 'быстрое',
  'праздничный', 'праздничная', 'домашний', 'домашняя', 'домашнее', 'простой', 'простая', 'простое',
  'ужин', 'обед', 'перекус', 'полдник', 'сладкий', 'сладкая', 'сладкое', 'чтонибудь', 'любой', 'любая',
  'вкусный', 'вкусная', 'вкусное', 'диетический', 'диетическая', 'диетическое', 'профессиональный',
  'профессиональная', 'профессиональное'
]);

const FILLER = new Set([
  'пожалуйста', 'плиз', 'можно', 'хочу', 'нужно', 'нужен', 'нужна', 'давай', 'давайте',
  'рецепт', 'блюдо', 'побыстрее', 'быстрее', 'просто', 'очень', 'только', 'потом'
]);

const LIMIT_TEXT = 'На сегодня лимит запросов закончился. Избранное, шаги и список покупок по уже открытому рецепту работают без нового запроса. Завтра снова можно спрашивать.';
const SEEK = 'Ищу рецепт в базе.';
const SEEK_LIST = 'Ищу варианты в базе.';

function blankUser(id) {
  return {
    id: String(id),
    mode: 'menu',
    draft: {},
    lastRecipe: null,
    stepIndex: 0,
    favorites: [],
    favSeq: 0,
    book: [],
    bookSeq: 0,
    history: [],
    usageDay: '',
    usageCount: 0,
    wallDay: '',
    wallCount: 0
  };
}

function overLimit(user, limit, now, bucket) {
  if (!limit) return false;
  const day = moscowDay(now);
  const wall = bucket === 'wall';
  const savedDay = wall ? user.wallDay : user.usageDay;
  const count = wall ? user.wallCount : user.usageCount;
  if (savedDay !== day) return false;
  return (count || 0) >= limit;
}

function bumpUsage(user, now, kind) {
  const day = moscowDay(now);
  if (kind === 'comment') {
    if (user.wallDay !== day) {
      user.wallDay = day;
      user.wallCount = 0;
    }
    user.wallCount += 1;
    return;
  }
  if (user.usageDay !== day) {
    user.usageDay = day;
    user.usageCount = 0;
  }
  user.usageCount += 1;
}

function welcomeText() {
  return 'Здравствуйте. Я Кухонный Помощник. Нажмите «Поиск рецептов» и напишите, что приготовить. Готовый рецепт можно положить в «Моя кулинарная книга».';
}

function helpText() {
  return [
    'Справка.',
    '«Поиск рецептов»: напишите как есть, например «сырники на два человека», «рецепт для диабетика», «курица и рис».',
    '«Сохранить» кладёт рецепт в «Моя кулинарная книга».',
    'В книге рецепты лежат по разделам. «Новый раздел» заводит свой, например «Завтраки».',
    '«Список по разделам» показывает общую книгу: разделы и рецепты кнопками, если кнопка включена.',
    '«открой 1» открывает рецепт, «удали 2» убирает его.',
    'Фото не разбираю.'
  ].join('\n');
}

function say(text, keyboard) {
  return { text, keyboard: keyboard || menuKeyboard() };
}

function shown(text, ctx, query, compact) {
  if (String(text || '').includes('988')) return text;
  const lesson = matchLesson(query || '', (ctx && ctx.lessons) || []);
  return withPromo(text, { lesson, compact: !!compact });
}

function isGreeting(text) {
  return ['привет', 'здравствуйте', 'здравствуй', 'добрый день', 'добрый вечер', 'доброе утро', 'хай', 'hello', 'hi'].includes(normalize(text));
}

function actionOf(text, payload) {
  if (payload && payload.command === 'start') return 'menu';
  if (payload && payload.a) return String(payload.a);
  const value = normalize(text);
  if (!value) return '';
  if (['начать', 'start', '/start', 'меню', 'в меню', 'назад', 'отмена', 'стоп', 'хватит', 'готово'].includes(value)) return 'menu';
  if (['помощь', 'справка', 'help', '/help'].includes(value)) return 'help';
  if (['избранное', 'избранные', 'сохраненные', 'сохраненное', 'моя кулинарная книга', 'кулинарная книга', 'моя книга'].includes(value)) return 'favorites';
  if (['покупки', 'список покупок', 'что купить', 'список'].includes(value)) return 'shop';
  if (['по шагам', 'шаги', 'шаг', 'сначала', 'с начала', 'готовить по шагам'].includes(value)) return 'steps';
  if (['дальше', 'далее', 'следующий', 'следующий шаг'].includes(value)) return 'next';
  if (['сохрани в базу', 'в базу'].includes(value)) return 'keep';
  if (['моя база', 'база'].includes(value)) return 'base';
  if (['сохрани', 'сохранить', 'в избранное', 'избранное сохранить', 'в книгу'].includes(value)) return 'save';
  if (['новый раздел'].includes(value)) return 'newsection';
  if (['еще вариант', 'другой вариант', 'другой рецепт'].includes(value)) return 'another';
  if (['поделиться', 'на стену'].includes(value)) return value === 'на стену' ? 'wall' : 'share';
  if (['мой рецепт', 'свой рецепт'].includes(value)) return 'myrecipe';
  if (['что приготовить', 'блюдо'].includes(value)) return 'dish';
  if (value === 'рецепт') return 'dish';
  if (['из продуктов', 'из того что есть', 'продукты'].includes(value)) return 'ingredients';
  if (['быстрый ужин', 'быстро'].includes(value)) return 'quick';
  if (['по диете', 'ограничение'].includes(value)) return 'diet';
  if (['случайный', 'случайный рецепт', 'случайное блюдо', 'идея', 'идеи', 'несколько идей'].includes(value)) return 'random';
  if (['из того, что есть', 'из того что есть'].includes(value)) return 'ingredients';
  if (['диетическое'].includes(value)) return 'diet';
  if (['найти', 'найди', 'поиск', 'поиск рецептов', 'общий поиск', 'найти рецепт'].includes(value)) return 'search';
  if (['список по разделам', 'общие разделы', 'общая книга'].includes(value)) return 'public';
  return '';
}

function chatAddressed(input, botName) {
  if (!input || input.place !== 'chat') return true;
  if (input.mentioned || input.replyToBot) return true;
  if (input.payload && (input.payload.a || input.payload.command)) return true;
  const value = normalize(input.text);
  if (!value) return false;
  if (actionOf(input.text, input.payload)) return true;
  const name = normalize(botName);
  if (name && value.includes(name)) return true;
  return /рецепт|кухн|повар|приготов|найди|найти/.test(value);
}

const SERVING_WORDS = {
  один: 1, одна: 1, одно: 1, одного: 1,
  два: 2, две: 2, двух: 2, двоих: 2,
  три: 3, трех: 3, троих: 3,
  четыре: 4, четырех: 4,
  пять: 5, пяти: 5,
  шесть: 6, шести: 6,
  семь: 7, семи: 7,
  восемь: 8, восьми: 8,
  девять: 9, девяти: 9,
  десять: 10, десяти: 10
};

function readServings(text) {
  const value = normalize(text);
  let match = value.match(/(?:^|\s)(?:на|для)\s*(\d{1,2})(?:\s*(?:порц|персон|чел)[а-я]*)?/);
  if (!match) match = value.match(/^(\d{1,2})$/);
  if (!match) match = value.match(/^(\d{1,2})\s*(?:порц|персон|чел)/);
  if (match) {
    const n = Number(match[1]);
    if (!Number.isInteger(n) || n < 1 || n > 20) return null;
    return n;
  }
  const word = value.match(/(?:^|\s)(?:на|для)\s+(один|одна|одно|одного|два|две|двух|двоих|три|трех|троих|четыре|четырех|пять|пяти|шесть|шести|семь|семи|восемь|восьми|девять|девяти|десять|десяти)(?:\s*(?:порц|персон|чел)[а-я]*)?/);
  if (word && SERVING_WORDS[word[1]]) return SERVING_WORDS[word[1]];
  if (value === 'как есть' || value === 'как в рецепте') return 0;
  return null;
}

function stripServings(text) {
  return String(text || '')
    .replace(/(^|\s)(?:на|для)\s*\d{1,2}(?:\s*(?:порц|персон|чел)[а-яё]*)?/gi, ' ')
    .replace(/(^|\s)(?:на|для)\s+(?:один|одна|одно|одного|два|две|двух|двоих|три|трех|трёх|троих|четыре|четырех|четырёх|пять|пяти|шесть|шести|семь|семи|восемь|восьми|девять|девяти|десять|десяти)(?:\s*(?:порц|персон|чел)[а-яё]*)?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanDish(text) {
  return stripServings(text)
    .replace(/^(?:рецепт|как приготовить|как сделать|найди|найти|поиск|покажи)\s+/i, '')
    .replace(/[,.!?«»"]/g, ' ')
    .split(/\s+/)
    .filter(word => word && !FILLER.has(normalize(word)))
    .join(' ')
    .trim();
}

function tooVague(name, id) {
  if (id && vagueDish(name, id)) return true;
  const words = normalize(name).split(/[^a-zа-я0-9]+/).filter(word => word.length >= 3);
  if (!words.length) return true;
  return words.every(word => GENERIC.has(word));
}

function readMinutes(text) {
  const value = normalize(text);
  const match = value.match(/(\d{1,3})\s*(?:мин|минут)/) || value.match(/^(\d{1,3})$/);
  if (!match) return null;
  const n = Number(match[1]);
  if (n < 5 || n > 180) return null;
  return n;
}

function wantsQuick(text) {
  const value = normalize(text);
  if (!/ужин|быстр|успе/.test(value) && !/за\s*\d{1,3}\s*мин/.test(value)) return null;
  return readMinutes(value);
}

function favoriteCommand(text) {
  const match = normalize(text).match(/^(удали|убери|открой|покажи)\s*(\d{1,2})$/);
  if (!match) return null;
  const index = Number(match[2]) - 1;
  if (!Number.isInteger(index) || index < 0) return null;
  const op = match[1] === 'удали' || match[1] === 'убери' ? 'delete' : 'open';
  return { op, index };
}

function looksLikeIngredients(text) {
  const raw = String(text || '').trim();
  const value = normalize(raw);
  if (/^что приготовить из\s+\S+/.test(value) || /^из\s+\S+/.test(value) || /у меня есть\s+\S+/.test(value)) return true;
  if (value.includes('?')) return false;
  const parts = raw.split(/[,;\n]|\s+и\s+/i).map(part => part.trim()).filter(part => {
    const word = normalize(part);
    return word.length >= 3 && !FILLER.has(word);
  });
  return parts.length >= 2 && parts.length <= 12 && raw.length <= 300;
}

function followUp(text, hasRecipe) {
  if (!hasRecipe) return false;
  return /замени|вместо|порци|острее|проще|пошаг|упрости|сделай|а если|соус|калори|другой вариант/.test(normalize(text));
}

function remember(user, userText, botText) {
  user.history = (user.history || []).concat([
    { role: 'user', content: clip(userText, 500) },
    { role: 'assistant', content: clip(botText, 800) }
  ]).slice(-8);
}

function aiJob(kind, data, ask) {
  const memory = data.text || data.dish || data.products || data.theme || data.diet || kind;
  return {
    usesAi: true,
    kind,
    data,
    prompt: buildUserPrompt(kind, data),
    ask,
    memory: String(memory).slice(0, 500)
  };
}

function menuTurn(user, ctx) {
  user.mode = 'menu';
  user.draft = {};
  return { user, messages: [say(welcomeText(ctx && ctx.botName), menuKeyboard())], job: null };
}

function noRecipe(user) {
  user.mode = 'menu';
  user.draft = {};
  return {
    user,
    messages: [say('Сначала попросите рецепт. Потом его можно сохранить, разобрать по шагам и превратить в список покупок.', menuKeyboard())],
    job: null
  };
}

function sectionsOf(user) {
  if (!Array.isArray(user.book)) user.book = [];
  return user.book;
}

function libraryCard(user, item) {
  if (!item || !item.section) return null;
  const section = sectionsOf(user).find(row => row.id === item.section);
  if (!section || !section.title || !item.recipe) return null;
  return {
    section: section.title,
    title: item.title || item.recipe.title || 'Рецепт',
    recipe: item.recipe,
    userId: String(user.id || '')
  };
}

function withLibrary(view, user, item) {
  const card = libraryCard(user, item);
  if (card) view.publish = card;
  return view;
}

function looseCount(user) {
  return user.favorites.filter(item => !item.section).length;
}

function sectionTitle(text) {
  const value = String(text || '').replace(/[«»"]/g, '').replace(/\s+/g, ' ').trim();
  const plain = normalize(value);
  if (plain.length < 2 || plain.length > 24) return '';
  return value.slice(0, 24);
}

function addSection(user, title) {
  const book = sectionsOf(user);
  const same = book.find(item => normalize(item.title) === normalize(title));
  if (same) return { section: same, created: false };
  if (book.length >= 8) return { error: 'full' };
  user.bookSeq = (user.bookSeq || 0) + 1;
  const section = { id: `b${user.bookSeq}`, title };
  book.push(section);
  return { section, created: true };
}

function showFavorites(user) {
  user.mode = 'book';
  user.draft = {};
  const sections = sectionsOf(user);
  const loose = looseCount(user);
  if (!user.favorites.length && !sections.length) {
    return {
      user,
      messages: [say('Кулинарная книга пока пустая. После рецепта нажмите «Сохранить» и положите его в раздел.', menuKeyboard())],
      job: null
    };
  }
  const lines = sections.map(section => {
    const count = user.favorites.filter(item => item.section === section.id).length;
    return `${section.title} — ${count}`;
  });
  if (loose) {
    lines.push('Без раздела:');
    user.favorites.forEach((item, index) => {
      if (!item.section) lines.push(`${index + 1}. ${item.title}`);
    });
  }
  const text = `Моя кулинарная книга:\n${lines.join('\n')}\n\nОткройте раздел кнопкой. «открой 1» показывает рецепт, «удали 2» убирает его.`;
  return { user, messages: [say(text, bookKeyboard(sections, loose))], job: null };
}

function openBookSection(user, sectionId) {
  const id = sectionId === '-' ? '' : String(sectionId || '');
  sectionsOf(user);
  const section = id ? user.book.find(item => item.id === id) : null;
  if (id && !section) return showFavorites(user);
  const items = user.favorites
    .map((item, index) => ({ title: item.title, index, section: item.section || '' }))
    .filter(item => item.section === id);
  const name = section ? section.title : 'Без раздела';
  user.mode = 'book';
  user.draft = { section: id };
  if (!items.length) {
    return {
      user,
      messages: [say(`В разделе «${name}» пока пусто. Сохраните рецепт и положите его сюда.`, bookKeyboard(user.book, looseCount(user)))],
      job: null
    };
  }
  const lines = items.map(item => `${item.index + 1}. ${item.title}`);
  const text = `${name}:\n${lines.join('\n')}\n\nНомер — во всей книге. «открой 1» открывает, «удали 2» убирает.`;
  return { user, messages: [say(text, bookListKeyboard(items))], job: null };
}

function beginNewSection(user) {
  const pending = user.draft && user.draft.pending;
  user.mode = 'newsection';
  user.draft = pending ? { pending } : {};
  return {
    user,
    messages: [say('Напишите название раздела, например «Завтраки» или «Сладкое».', bookBackKeyboard())],
    job: null
  };
}

function fromNewSection(user, text) {
  const title = sectionTitle(text);
  if (!title) {
    return { user, messages: [say('Название раздела короткое. Напишите, например, «Завтраки».', bookBackKeyboard())], job: null };
  }
  const added = addSection(user, title);
  if (added.error) {
    user.mode = 'book';
    user.draft = {};
    return {
      user,
      messages: [say('В книге уже 8 разделов. Выберите один из них.', bookKeyboard(user.book, looseCount(user)))],
      job: null
    };
  }
  const pending = user.draft && user.draft.pending;
  user.mode = 'book';
  user.draft = {};
  const index = user.favorites.findIndex(item => item.id === pending);
  if (index >= 0) user.favorites[index].section = added.section.id;
  const view = openBookSection(user, added.section.id);
  const note = index >= 0
    ? `«${user.favorites[index].title}» теперь в разделе «${added.section.title}».`
    : (added.created ? `Раздел «${added.section.title}» создан.` : `Раздел «${added.section.title}» уже есть.`);
  view.messages[0].text = `${note}\n\n${view.messages[0].text}`;
  return index >= 0 ? withLibrary(view, user, user.favorites[index]) : view;
}

function putFavorite(user, index, sectionId) {
  sectionsOf(user);
  const item = user.favorites[index];
  const section = user.book.find(row => row.id === sectionId);
  if (!item || !section) return showFavorites(user);
  item.section = section.id;
  const view = openBookSection(user, section.id);
  view.messages[0].text = `«${item.title}» в разделе «${section.title}».\n\n${view.messages[0].text}`;
  return withLibrary(view, user, item);
}

function openFavorite(user, index) {
  if (!Number.isInteger(index) || index < 0 || !user.favorites[index]) {
    return { user, messages: [say('Такого номера в книге нет.', bookKeyboard(sectionsOf(user), looseCount(user)))], job: null };
  }
  const item = user.favorites[index];
  user.lastRecipe = structuredClone(item.recipe);
  user.stepIndex = 0;
  user.mode = 'menu';
  return { user, messages: [say(formatRecipe(item.recipe), recipeKeyboard(item.recipe))], job: null };
}

function deleteFavorite(user, index) {
  if (!Number.isInteger(index) || !user.favorites[index]) {
    return { user, messages: [say('Такого номера в книге нет.', bookKeyboard(sectionsOf(user), looseCount(user)))], job: null };
  }
  const [gone] = user.favorites.splice(index, 1);
  const keyboard = user.favorites.length || sectionsOf(user).length ? bookKeyboard(user.book, looseCount(user)) : menuKeyboard();
  return { user, messages: [say(`Убрала «${gone.title}» из кулинарной книги.`, keyboard)], job: null };
}

function saveFavorite(user, now) {
  if (!user.lastRecipe) return noRecipe(user);
  const title = user.lastRecipe.title || 'Рецепт';
  const existing = user.favorites.findIndex(item => normalize(item.title) === normalize(title));
  user.favSeq = (user.favSeq || 0) + 1;
  const entry = {
    id: `f${user.favSeq}`,
    title,
    recipe: structuredClone(user.lastRecipe),
    savedAt: now.toISOString(),
    section: existing >= 0 ? (user.favorites[existing].section || '') : ''
  };
  if (existing >= 0) user.favorites.splice(existing, 1, entry);
  else user.favorites.push(entry);
  if (user.favorites.length > 15) user.favorites.splice(0, user.favorites.length - 15);
  const index = user.favorites.findIndex(row => row.id === entry.id);
  user.mode = 'book';
  user.draft = { pending: entry.id };
  const place = entry.section && sectionsOf(user).find(item => item.id === entry.section);
  const note = place
    ? `«${title}» в кулинарной книге, раздел «${place.title}». Можно переложить.`
    : `«${title}» в кулинарной книге. Выберите раздел или заведите новый.`;
  return withLibrary({ user, messages: [say(note, putKeyboard(user.book, index))], job: null }, user, entry);
}

function showShop(user) {
  user.mode = 'menu';
  if (!user.lastRecipe) return noRecipe(user);
  return { user, messages: [say(formatShopping(user.lastRecipe), recipeKeyboard(user.lastRecipe))], job: null };
}

function showStep(user, index) {
  if (!user.lastRecipe || !Array.isArray(user.lastRecipe.steps) || !user.lastRecipe.steps.length) return noRecipe(user);
  if (index >= user.lastRecipe.steps.length) {
    user.mode = 'menu';
    user.stepIndex = 0;
    return { user, messages: [say(`Готово: «${user.lastRecipe.title}». Приятного аппетита.`, recipeKeyboard(user.lastRecipe))], job: null };
  }
  const safe = Math.max(0, index);
  user.mode = 'steps';
  user.stepIndex = safe;
  const last = safe === user.lastRecipe.steps.length - 1;
  return { user, messages: [say(formatStep(user.lastRecipe, safe), stepsKeyboard(last))], job: null };
}

function jobReply(user, job) {
  user.mode = 'menu';
  user.draft = {};
  if (job.data && job.data.section) user.lastCategory = job.data.section;
  else if (job.kind !== 'followup' && job.kind !== 'ideas') user.lastCategory = '';
  user.lastQuery = String(job.memory || '');
  return { user, messages: [say(job.ask, backKeyboard())], job };
}

function ideasJob(user, extra) {
  const data = Object.assign({ servings: 2 }, extra || {});
  if (!data.theme) data.theme = data.text || data.dish || data.products || data.diet || '';
  if (!data.text) data.text = data.theme;
  const node = data.section ? sectionById(data.section) : null;
  if (node && !data.title) {
    data.title = node.title;
    data.brief = node.brief;
  }
  return jobReply(user, aiJob('ideas', data, SEEK_LIST));
}

function beginDish(user) {
  user.mode = 'dish';
  user.draft = {};
  return { user, messages: [say('Какое блюдо приготовить? Можно сразу с порциями: «борщ на 6».', backKeyboard())], job: null };
}

function beginIngredients(user) {
  user.mode = 'ingredients';
  user.draft = {};
  return { user, messages: [say('Перечислите продукты через запятую. Кроме соли, масла и специй ничего лишнего не добавлю.', backKeyboard())], job: null };
}

function beginQuick(user) {
  user.mode = 'quick';
  user.draft = {};
  return { user, messages: [say('Сколько есть минут? Выберите кнопку или напишите число.', minutesKeyboard())], job: null };
}

function beginDiet(user) {
  return openSection(user, 'diet');
}

function openSection(user, id) {
  const node = sectionById(id);
  if (!node) return { user, messages: [say('Такого раздела нет.', menuKeyboard())], job: null };
  user.mode = 'section';
  user.draft = { section: id };
  user.lastCategory = id;
  return { user, messages: [say(sectionText(id), sectionKeyboard(id))], job: null };
}

function vagueDish(name, id) {
  const node = sectionById(id);
  if (!node) return false;
  const value = normalize(name);
  const titles = [node.title, node.short].map(normalize).filter(Boolean);
  if (titles.includes(value)) return true;
  return titles.some(title => title.startsWith(value) && title.length - value.length <= 2);
}

function makeSection(user, id, dish, servings) {
  const node = sectionById(id);
  if (!node) return { user, messages: [say('Такого раздела нет.', menuKeyboard())], job: null };
  const name = String(dish || '').trim();
  if (!dishNameOk(name) || tooVague(name, id)) return openSection(user, id);
  const data = {
    section: id,
    title: node.title,
    brief: node.brief,
    dish: name,
    servings: servings == null ? 0 : servings,
    text: [node.title, name].filter(Boolean).join('. ')
  };
  if (wishQuery(name)) data.free = true;
  return jobReply(user, aiJob('section', data, SEEK));
}

function fromSectionDish(user, id, text) {
  const servings = readServings(text);
  const name = cleanDish(text);
  if (!dishNameOk(name) || tooVague(name, id)) {
    return { user, messages: [say('Напишите блюдо целиком, например «гороховый суп на 4». Одного слова «суп» мало.', sectionKeyboard(id) || menuKeyboard())], job: null };
  }
  return makeSection(user, id, name, servings);
}

function namedSection(user, text) {
  if (['dish', 'ingredients', 'servings', 'quick', 'diet'].includes(user.mode)) return null;
  const id = sectionAlias(text);
  if (!id) return null;
  return openSection(user, id);
}

function askServings(user, draft) {
  user.mode = 'servings';
  user.draft = draft;
  return { user, messages: [say('На сколько порций готовим?', servingsKeyboard())], job: null };
}

function finishServings(user, servings) {
  const draft = Object.assign({}, user.draft, { servings: Number(servings) || 0 });
  const kind = draft.kind || 'dish';
  if (kind === 'ingredients' && !draft.products) return beginIngredients(user);
  if (kind === 'dish' && !draft.dish) return beginDish(user);
  if (kind === 'ingredients') {
    return ideasJob(user, {
      products: draft.products,
      theme: `из продуктов: ${draft.products}`,
      servings: draft.servings,
      section: user.lastCategory || ''
    });
  }
  return jobReply(user, aiJob(kind, draft, SEEK));
}

function dishNameOk(name) {
  const value = normalize(name);
  return value.length >= 3 && !['ок', 'окей', 'да', 'нет', 'ага'].includes(value);
}

function wishQuery(text) {
  const value = normalize(text);
  if (!value) return false;
  if (/для\s+\S+/.test(value)) return true;
  return /диабет|деобет|диет|болезн|похуд|калор|аллерг|халял|кошер|веган|вегетар|постн|глютен|без сахара|сыроед|пескетар|инсулин/.test(value);
}

function requestText(text) {
  return stripServings(text)
    .replace(/^(?:рецепт|как приготовить|как сделать|найди|найти|поиск рецептов|поиск|покажи)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fromDishText(user, text) {
  const servings = readServings(text);
  const name = requestText(text);
  if (!dishNameOk(name)) {
    return { user, messages: [say('Напишите, что приготовить, например «сырники» или «борщ на 6».', backKeyboard())], job: null };
  }
  const data = { dish: name, servings: servings == null ? 0 : servings };
  if (wishQuery(text)) data.free = true;
  return jobReply(user, aiJob('dish', data, SEEK));
}

function fromIngredientsText(user, text) {
  const clean = String(text || '')
    .replace(/^что приготовить из\s+/i, '')
    .replace(/^из\s+/i, '')
    .replace(/^у меня есть\s+/i, '')
    .trim();
  const products = stripServings(clean);
  if (normalize(products).length < 3) {
    return { user, messages: [say('Напишите хотя бы один продукт.', backKeyboard())], job: null };
  }
  const servings = readServings(text);
  if (servings == null) return askServings(user, { kind: 'ingredients', products });
  return ideasJob(user, {
    products,
    theme: `из продуктов: ${products}`,
    servings,
    section: user.lastCategory || ''
  });
}

function fromQuick(user, minutes) {
  const n = Number(minutes);
  if (!Number.isInteger(n) || n < 5 || n > 180) return beginQuick(user);
  return ideasJob(user, { minutes: n, theme: `ужин за ${n} минут`, servings: 2, section: user.lastCategory || '' });
}

function fromDiet(user, code) {
  const diet = DIETS[code];
  if (!diet) return beginDiet(user);
  return ideasJob(user, { diet, theme: diet, servings: 2 });
}

function dietFromText(text) {
  const value = normalize(text);
  const hit = DIET_WORDS.find(pair => value.includes(pair[0]));
  return hit ? hit[1] : '';
}

function dietOnly(text) {
  const code = dietFromText(text);
  if (!code) return '';
  let value = normalize(text);
  const cuts = [
    /вегетариан\S*/g, /веганск\S*/g, /пескетариан\S*/g, /халяль\S*/g, /кошерн\S*/g,
    /сыроед\S*/g, /постн\S*/g, /без сахара/g, /без глютена/g, /без молока/g,
    /без молоч\S*/g, /детск\S*/g, /бюджет\S*/g, /глютен\S*/g, /белков\S*/g,
    /больше белка/g, /рецепт/g, /блюдо/g, /еда/g, /кухня/g, /пожалуйста/g
  ];
  for (const cut of cuts) value = value.replace(cut, ' ');
  const words = value.split(/[^a-zа-я0-9]+/).filter(word => {
    return word.length >= 3 && !GENERIC.has(word) && !FILLER.has(word) && !THEME.has(word);
  });
  return words.length ? '' : code;
}

function searchIsTheme(name) {
  if (tooVague(name, '')) return true;
  const words = normalize(name).split(/[^a-zа-я0-9]+/).filter(word => word.length >= 3);
  if (!words.length) return true;
  return words.every(word => GENERIC.has(word) || THEME.has(word));
}

function beginSearch(user) {
  user.mode = 'search';
  user.draft = {};
  user.lastCategory = '';
  return {
    user,
    messages: [say('Напишите, что приготовить, своими словами. Например: «сырники на два человека» или «рецепт для диабетика».', searchKeyboard())],
    job: null
  };
}

function fromSearch(user, text) {
  user.lastCategory = '';
  return fromDishText(user, text);
}

function beginIdeas(user) {
  user.mode = 'ideas';
  user.draft = { section: user.lastCategory || '' };
  return {
    user,
    messages: [say('Напишите тему: «супы на обед», «ужин без духовки» или «сладкое к чаю». Пришлю несколько названий. Рецепт откроется после выбора.', backKeyboard())],
    job: null
  };
}

function fromIdeasText(user, text) {
  const theme = cleanDish(text);
  if (!dishNameOk(theme)) {
    return { user, messages: [say('Напишите тему, например «ужин без духовки».', backKeyboard())], job: null };
  }
  return ideasJob(user, {
    theme,
    servings: readServings(text) == null ? 2 : readServings(text),
    section: (user.draft && user.draft.section) || user.lastCategory || ''
  });
}

function chooseIdea(user, index) {
  const draft = user.draft || {};
  const ideas = draft.ideas || [];
  if (!ideas[index]) {
    return { user, messages: [say('Такого номера нет. Напишите номер из списка.', ideaKeyboard(ideas))], job: null };
  }
  const title = ideas[index].title;
  const servings = draft.servings == null ? 2 : draft.servings;
  const section = draft.section || user.lastCategory || '';
  if (section && sectionById(section)) return makeSection(user, section, title, servings);
  return jobReply(user, aiJob('dish', { dish: title, servings, text: title }, SEEK));
}

function fromChoice(user, text) {
  const ideas = (user.draft && user.draft.ideas) || [];
  const num = normalize(text).match(/^(\d{1,2})$/);
  if (num) return chooseIdea(user, Number(num[1]) - 1);
  const bare = String(text || '').replace(/^\d{1,2}\s*[.)]?\s*/, '');
  const wanted = normalize(cleanDish(bare));
  const hit = ideas.findIndex(item => normalize(item.title) === wanted);
  if (hit >= 0) return chooseIdea(user, hit);
  if (dishNameOk(cleanDish(text)) && !tooVague(cleanDish(text), user.draft && user.draft.section)) return fromDishText(user, text);
  return { user, messages: [say('Напишите номер из списка.', ideaKeyboard(ideas))], job: null };
}

function fromFollow(user, text) {
  return jobReply(user, aiJob('followup', { text, recipe: user.lastRecipe }, SEEK));
}

function fromChat(user, text) {
  return jobReply(user, aiJob('chat', { text, recipe: user.lastRecipe }, SEEK));
}

function ownTitle(text) {
  const line = String(text || '').split('\n').map(item => item.trim()).find(Boolean) || 'Мой рецепт';
  return line.replace(/^(?:рецепт|мой рецепт)\s+/i, '').slice(0, 80) || 'Мой рецепт';
}

function beginOwn(user) {
  const section = (user.draft && user.draft.section) || user.lastCategory || '';
  user.mode = 'own';
  user.draft = { section };
  return {
    user,
    messages: [say('Напишите свой рецепт одним сообщением: название, продукты и как готовить. Он попадёт в общую базу.', backKeyboard())],
    job: null
  };
}

function fromOwn(user, text) {
  const body = String(text || '').trim();
  if (body.length < 20) {
    return {
      user,
      messages: [say('Добавьте название, продукты и хотя бы пару шагов. Одним сообщением.', backKeyboard())],
      job: null
    };
  }
  const title = ownTitle(body);
  const category = (user.draft && user.draft.section) || '';
  user.mode = 'menu';
  user.lastCategory = category;
  user.pendingShare = { title, body, source: 'own' };
  return {
    user,
    messages: [say(`Сохранила «${title}» в общую базу.`, shareKeyboard())],
    job: null,
    share: { title, body, source: 'own' },
    catalog: { category, title, query: title, recipe: null, body, source: 'own' }
  };
}

function keepInBase(user) {
  if (!user.lastRecipe) return noRecipe(user);
  const title = user.lastRecipe.title || 'Рецепт';
  const category = user.lastCategory || '';
  return {
    user,
    messages: [say(`Сохранила «${title}» в общую базу.`, recipeKeyboard(user.lastRecipe))],
    job: null,
    catalog: {
      category,
      title,
      query: user.lastQuery || title,
      recipe: user.lastRecipe,
      body: formatRecipe(user.lastRecipe),
      source: 'found'
    }
  };
}

function showBase(user) {
  user.mode = 'menu';
  user.draft = {};
  return { user, messages: [], job: null, listCatalog: true };
}

function shareCurrent(user) {
  if (!user.lastRecipe) {
    return {
      user,
      messages: [say('Сначала откройте рецепт. Потом «Поделиться» даст текст для пересылки и кнопку «На стену». Свой текст присылают через «Мой рецепт».', hubKeyboard('mine') || menuKeyboard())],
      job: null
    };
  }
  const body = formatRecipe(user.lastRecipe);
  const title = user.lastRecipe.title || 'Рецепт';
  user.mode = 'menu';
  user.pendingShare = { title, body, source: 'bot' };
  return {
    user,
    messages: [say(`«${title}» можно переслать из этой переписки.\n\n«На стену» публикует рецепт в сообществе.`, shareKeyboard())],
    job: null,
    share: { title, body, source: 'bot' }
  };
}

function askWall(user) {
  if (!user.pendingShare || !user.pendingShare.body) return shareCurrent(user);
  return { user, messages: [], job: null, post: user.pendingShare };
}

function showPublic(user, ctx) {
  if (!ctx || !ctx.publicSections) {
    user.mode = 'menu';
    user.draft = {};
    return { user, messages: [say('Список по разделам сейчас скрыт.', menuKeyboard())], job: null };
  }
  const groups = Array.isArray(ctx.library) ? ctx.library : [];
  user.mode = 'public';
  user.draft = {};
  if (!groups.length) {
    return {
      user,
      messages: [say('В общем списке пока пусто. Рецепт попадает сюда, когда его кладут в раздел своей книги.', menuKeyboard())],
      job: null
    };
  }
  const lines = groups.map(group => `${group.section} — ${group.recipes.length}`);
  return {
    user,
    messages: [say(`Список по разделам:\n${lines.join('\n')}\n\nОткройте раздел кнопкой.`, publicKeyboard(groups))],
    job: null
  };
}

function openPublicSection(user, ctx, name) {
  const groups = Array.isArray(ctx && ctx.library) ? ctx.library : [];
  const group = groups.find(item => normalize(item.section) === normalize(name));
  if (!group) return showPublic(user, ctx);
  user.mode = 'public';
  user.draft = { publicSection: group.section };
  const lines = group.recipes.map((item, index) => `${index + 1}. ${item.title}`);
  return {
    user,
    messages: [say(`${group.section}:\n${lines.join('\n')}\n\nОткройте рецепт кнопкой.`, publicListKeyboard(group))],
    job: null
  };
}

function openPublicRecipe(user, ctx, name, index) {
  const groups = Array.isArray(ctx && ctx.library) ? ctx.library : [];
  const group = groups.find(item => normalize(item.section) === normalize(name));
  const item = group && group.recipes[index];
  if (!item || !item.recipe) return showPublic(user, ctx);
  user.lastRecipe = structuredClone(item.recipe);
  user.stepIndex = 0;
  user.mode = 'menu';
  return { user, messages: [say(formatRecipe(item.recipe), recipeKeyboard())], job: null };
}

function openHub(user, id) {
  const text = hubText(id);
  const keyboard = hubKeyboard(id);
  if (!text || !keyboard) return { user, messages: [say('Такого раздела нет.', menuKeyboard())], job: null };
  user.mode = 'menu';
  user.draft = {};
  return { user, messages: [say(text, keyboard)], job: null };
}

function routeFreeText(user, text) {
  if (user.mode === 'newsection') return fromNewSection(user, text);
  const favorite = favoriteCommand(text);
  if (favorite) return favorite.op === 'delete' ? deleteFavorite(user, favorite.index) : openFavorite(user, favorite.index);
  if (user.mode === 'search') return fromSearch(user, text);
  if (user.mode === 'ideas') return fromIdeasText(user, text);
  if (user.mode === 'choose') return fromChoice(user, text);
  if (user.mode === 'own') return fromOwn(user, text);
  if (user.mode === 'dish') return fromDishText(user, text);
  if (user.mode === 'ingredients') return fromIngredientsText(user, text);
  if (user.mode === 'servings') {
    const servings = readServings(text);
    if (servings == null) return { user, messages: [say('Напишите число порций от 1 до 20 или нажмите кнопку.', servingsKeyboard())], job: null };
    return finishServings(user, servings);
  }
  if (user.mode === 'quick') {
    const minutes = readMinutes(text);
    if (minutes == null) return { user, messages: [say('Напишите минуты от 5 до 180 или выберите кнопку.', minutesKeyboard())], job: null };
    return fromQuick(user, minutes);
  }
  if (user.mode === 'diet') {
    const code = dietFromText(text);
    if (!code) return { user, messages: [say('Выберите ограничение кнопкой.', dietKeyboard())], job: null };
    return fromDiet(user, code);
  }
  if (user.mode === 'section' && user.draft && user.draft.section) {
    const picked = namedSection(user, text);
    if (picked) return picked;
    if (followUp(text, !!user.lastRecipe)) return fromFollow(user, text);
    if (looksLikeIngredients(text)) {
      const node = sectionById(user.draft.section);
      return ideasJob(user, {
        products: stripServings(text),
        theme: `из продуктов: ${stripServings(text)}`,
        section: user.draft.section,
        servings: readServings(text) == null ? 2 : readServings(text),
        title: node ? node.title : '',
        brief: node ? node.brief : ''
      });
    }
    const quickHere = wantsQuick(text);
    if (quickHere) return fromQuick(user, quickHere);
    return fromSectionDish(user, user.draft.section, text);
  }
  if (followUp(text, !!user.lastRecipe)) return fromFollow(user, text);
  return fromDishText(user, text);
}

function turn(user, input, ctx) {
  usePublicList(Boolean(ctx && ctx.publicSections));
  const source = user ? structuredClone(user) : blankUser((input && input.userId) || '0');
  if (!Array.isArray(source.favorites)) source.favorites = [];
  if (!Array.isArray(source.book)) source.book = [];
  if (!Array.isArray(source.history)) source.history = [];
  if (!source.draft || typeof source.draft !== 'object') source.draft = {};
  const incoming = input || {};
  const text = String(incoming.text || '').trim();
  const payload = incoming.payload || null;
  const place = incoming.place || 'dm';
  if (place === 'chat' && !chatAddressed(incoming, ctx && ctx.botName)) {
    return { user: source, messages: [], job: null, ignore: true };
  }
  const reason = blockedReason(text);
  if (reason) {
    source.mode = 'menu';
    source.draft = {};
    return { user: source, messages: [say(shown(reason), menuKeyboard())], job: null };
  }
  if (isGreeting(text) && !payload && place !== 'chat') return menuTurn(source, ctx);
  if (!text && !payload) {
    if (incoming.photo) {
      return { user: source, messages: [say('Фото пока не разбираю. Напишите продукты списком — найду рецепт в базе.', menuKeyboard())], job: null };
    }
    if (incoming.mentioned && place === 'chat') return menuTurn(source, ctx);
    return { user: source, messages: [], job: null, ignore: true };
  }
  if (payload && payload.a === 'servings') return finishServings(source, Number(payload.n) || 0);
  if (payload && payload.a === 'minutes') return fromQuick(source, Number(payload.n));
  if (payload && payload.a === 'pickdiet') return fromDiet(source, String(payload.d || ''));
  if (payload && payload.a === 'section') return openSection(source, String(payload.s || ''));
  if (payload && payload.a === 'make') return openSection(source, String(payload.s || ''));
  if (payload && payload.a === 'choose') return chooseIdea(source, Number(payload.i));
  if (payload && payload.a === 'hub') return openHub(source, String(payload.h || ''));
  if (payload && payload.a === 'search') return beginSearch(source);
  if (payload && payload.a === 'open') return openFavorite(source, Number(payload.i));
  if (payload && payload.a === 'openbase') {
    const id = String(payload.id || '').replace(/[^\w-]/g, '').slice(0, 40);
    if (!id) {
      return { user: source, messages: [say('Этот рецепт из базы не открылся. Напишите название.', hubKeyboard('mine') || menuKeyboard())], job: null };
    }
    return { user: source, messages: [], job: null, openCatalog: id };
  }
  const action = actionOf(text, payload);
  if (action === 'menu') return menuTurn(source, ctx);
  if (action === 'help') {
    source.mode = 'menu';
    source.draft = {};
    return { user: source, messages: [say(helpText(), menuKeyboard())], job: null };
  }
  if (action === 'favorites') return showFavorites(source);
  if (action === 'newsection') return beginNewSection(source);
  if (action === 'book') return openBookSection(source, String((payload && payload.s) || ''));
  if (action === 'put') return putFavorite(source, Number(payload && payload.i), String((payload && payload.s) || ''));
  if (action === 'public') return showPublic(source, ctx);
  if (action === 'pubsec') return openPublicSection(source, ctx, String((payload && payload.s) || ''));
  if (action === 'pubopen') return openPublicRecipe(source, ctx, String((payload && payload.s) || ''), Number(payload && payload.i));
  if (action === 'shop') return showShop(source);
  if (action === 'steps') return showStep(source, 0);
  if (action === 'next') return showStep(source, (source.stepIndex || 0) + (source.mode === 'steps' ? 1 : 0));
  if (action === 'save') return saveFavorite(source, (ctx && ctx.now) || new Date());
  if (action === 'keep') return keepInBase(source);
  if (action === 'base') return showBase(source);
  if (action === 'another') {
    if (source.lastRecipe) {
      return ideasJob(source, {
        theme: `другие блюда вместо «${source.lastRecipe.title}»`,
        avoid: source.lastRecipe.title,
        section: source.lastCategory || '',
        servings: 2
      });
    }
    return beginIdeas(source);
  }
  if (action === 'dish') return beginDish(source);
  if (action === 'ingredients') return beginIngredients(source);
  if (action === 'quick') return beginQuick(source);
  if (action === 'diet') return openSection(source, 'diet');
  if (action === 'random') return beginIdeas(source);
  if (action === 'search') return beginSearch(source);
  if (action === 'share') return shareCurrent(source);
  if (action === 'myrecipe') return beginOwn(source);
  if (action === 'wall') return askWall(source);
  return routeFreeText(source, text);
}

function limitTurn(user) {
  const next = structuredClone(user);
  next.mode = 'menu';
  next.draft = {};
  return { user: next, messages: [say(withPromo(LIMIT_TEXT), menuKeyboard())], job: null };
}

function complete(user, job, raw, ctx) {
  const now = (ctx && ctx.now) || new Date();
  const next = structuredClone(user);
  if (job.kind === 'comment') {
    const text = commentBody(raw, (ctx && ctx.invite) || 'Полный рецепт — в сообщениях сообщества.');
    if (!text) return { user: next, messages: [], commentText: '', recipe: false };
    bumpUsage(next, now, 'comment');
    return { user: next, messages: [], commentText: shown(text, ctx, job.memory, true), recipe: false };
  }
  if (job.kind === 'ideas') {
    const ideas = parseIdeas(raw);
    const topic = (job.data && (job.data.theme || job.data.text)) || 'эта тема';
    next.draft = {
      ideas,
      section: (job.data && job.data.section) || '',
      servings: job.data && job.data.servings != null ? job.data.servings : 2,
      theme: topic
    };
    if (next.draft.section) next.lastCategory = next.draft.section;
    remember(next, topic, ideas.map(item => item.title).join(', '));
    if (!ctx || !ctx.saved) bumpUsage(next, now, 'dm');
    if (ideas.length < 3) {
      next.mode = 'ideas';
      return {
        user: next,
        messages: [say('В базе мало вариантов по этому запросу. Напишите тему конкретнее.', backKeyboard())],
        commentText: '',
        recipe: false
      };
    }
    next.mode = 'choose';
    return {
      user: next,
      messages: [{ text: shown(formatIdeas(ideas, topic), ctx, topic), keyboard: ideaKeyboard(ideas) }],
      commentText: '',
      recipe: false
    };
  }
  const recipe = parseRecipe(raw);
  const asked = job.data && String(job.data.dish || '').trim();
  const free = Boolean(job.data && job.data.free);
  let answer = recipe ? formatRecipe(recipe) : (asPlain(raw) || 'Не разобрала ответ. Напишите запрос ещё раз, можно короче.');
  if (free && /диабет|деобет|болезн|похуд|лечебн|инсулин|давлен|холестер/.test(normalize(asked)) && !/не рекомендация врача|не лечебн/.test(answer)) {
    answer += '\n\nЭто обычная домашняя еда, не рекомендация врача.';
  }
  if (recipe) {
    next.lastRecipe = recipe;
    next.stepIndex = 0;
  }
  next.mode = 'menu';
  next.draft = {};
  remember(next, job.memory || job.prompt, answer);
  if (job.kind === 'section' && job.data && job.data.section) next.lastCategory = job.data.section;
  if (!ctx || !ctx.saved) bumpUsage(next, now, 'dm');
  const keyboard = recipe || next.lastRecipe ? recipeKeyboard(recipe || next.lastRecipe) : menuKeyboard();
  return {
    user: next,
    messages: [{ text: shown(answer, ctx, job.memory || job.prompt), keyboard }],
    commentText: '',
    recipe: Boolean(recipe)
  };
}

function fromCatalog(user, job, found, ctx) {
  const nextJob = job || { kind: 'dish', memory: found && found.title, prompt: '' };
  const lead = nextJob.kind === 'catalog' ? '' : 'Нашла в базе.\n\n';
  if (found && found.recipe) {
    const done = complete(user, nextJob, JSON.stringify(found.recipe), Object.assign({}, ctx, { saved: true }));
    if (lead && done.messages[0]) done.messages[0].text = `${lead}${done.messages[0].text}`;
    if (found.category) done.user.lastCategory = found.category;
    done.recipe = true;
    return done;
  }
  const next = structuredClone(user);
  next.mode = 'menu';
  next.draft = {};
  if (found && found.category) next.lastCategory = found.category;
  const body = String((found && found.body) || '').trim() || 'Рецепт в базе пустой. Напишите название ещё раз.';
  return {
    user: next,
    messages: [{ text: shown(`${lead}${body}`, ctx, nextJob.memory), keyboard: menuKeyboard() }],
    commentText: '',
    recipe: true
  };
}

module.exports = {
  blankUser,
  overLimit,
  turn,
  complete,
  fromCatalog,
  limitTurn,
  chatAddressed,
  actionOf,
  LIMIT_TEXT,
  DIETS
};
