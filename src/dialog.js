'use strict';

const {
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
} = require('./keyboard');
const { buildUserPrompt } = require('./prompt');
const { parseRecipe, asPlain, formatRecipe, formatShopping, formatStep, commentBody } = require('./recipe');
const { normalize, clip, moscowDay } = require('./text');
const { blockedReason } = require('./guard');
const { sectionById, sectionAlias, sectionKeyboard, sectionText } = require('./menu');
const { withPromo } = require('./promo');
const { matchLesson } = require('./lessons');

const DIETS = {
  vegetarian: 'вегетарианское, без мяса и рыбы',
  nosugar: 'без добавленного сахара',
  kids: 'детское, мягкий вкус, без острого и алкоголя',
  budget: 'бюджетное, недорогие продукты',
  nogluten: 'без глютена: без пшеницы, ржи и обычной муки',
  protein: 'с заметной белковой частью, без медицинских обещаний'
};

const DIET_WORDS = [
  ['вегетар', 'vegetarian'],
  ['без сахара', 'nosugar'],
  ['детск', 'kids'],
  ['бюджет', 'budget'],
  ['глютен', 'nogluten'],
  ['белк', 'protein']
];

const THEMES = [
  'суп',
  'салат',
  'завтрак',
  'ужин без духовки',
  'простая выпечка',
  'закуска к чаю',
  'гарнир',
  'десерт без духовки',
  'домашний напиток',
  'обед в одной сковороде'
];

const FILLER = new Set([
  'пожалуйста', 'плиз', 'можно', 'хочу', 'нужно', 'нужен', 'нужна', 'давай', 'давайте',
  'рецепт', 'блюдо', 'побыстрее', 'быстрее', 'просто', 'очень', 'только', 'потом'
]);

const LIMIT_TEXT = 'На сегодня лимит запросов закончился. Избранное, шаги и список покупок по уже открытому рецепту работают без нового запроса. Завтра снова можно спрашивать.';
const SEEK = 'Ищу рецепт в базе.';

function blankUser(id) {
  return {
    id: String(id),
    mode: 'menu',
    draft: {},
    lastRecipe: null,
    stepIndex: 0,
    favorites: [],
    favSeq: 0,
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

function welcomeText(name) {
  return [
    `Здравствуйте. Я ${name || 'Кухонный'}, кухонный помощник сообщества.`,
    '',
    'Напишите блюдо своими словами, например «борщ на 4», или выберите раздел кнопкой.',
    '',
    'Обед — супы, вторые, салаты, закуски и гарниры.',
    'Завтрак — каши, яичница и напитки.',
    'Сладкое — выпечка, десерты и кондитер.',
    'Подбор — из продуктов дома, быстрый ужин, случайное блюдо, без аллергенов и диета.',
    'Мои рецепты — избранное, свой рецепт и кнопка, чтобы поделиться.',
    'Справка — что делает каждая кнопка.'
  ].join('\n');
}

function helpText(communityName) {
  return [
    `Справка помощника «${communityName || 'Кухня'}».`,
    '',
    'Как попросить рецепт',
    'Напишите своими словами: «борщ на 6», «рецепт сырников», «что приготовить из курицы и риса», «ужин за 20 минут».',
    'К уже открытому рецепту можно написать «замени сметану» или «на 4 порции».',
    '',
    'Кнопки меню',
    'Обед — первые, вторые, салаты, закуски, гарниры.',
    'Завтрак — завтраки и напитки.',
    'Сладкое — выпечка, десерты, торты и пирожные. У кондитера есть свои безаллергенные и диетические подразделы.',
    'Подбор — «Из того, что есть» готовит из продуктов дома. «Быстрый ужин» укладывается в несколько минут. «Случайное блюдо» предлагает идею. «Без аллергенов» и «Диетическое» — обычная домашняя еда, не назначение врача.',
    'Мои рецепты — избранное, общая база и собственный текст.',
    'Кнопка раздела ничего не ищет сама. Сначала откройте полку, например «Супы», и напишите блюдо: «борщ на 4».',
    '',
    'Кнопки у рецепта',
    'В избранное — короткая закладка. Потом откройте «Избранное» или напишите «открой 1». «удали 2» убирает второй.',
    'Готовый рецепт сам попадает в общую базу. Её видят все, но в чужом разделе рецепт не находится. Поиск идёт по названию и по описанию: продуктам, шагам и совету. «Моя база» показывает, что уже лежит.',
    'Список покупок — продукты, которые нужно купить для этого блюда. Это не оплата и не заказ.',
    'Готовить по шагам — один шаг за раз. «Дальше» показывает следующий.',
    'Другой рецепт — похожее блюдо, не копия текущего.',
    'Поделиться — текст рецепта можно переслать. «На стену» публикует его в сообществе.',
    'Мой рецепт — пришлите свой рецепт одним сообщением: название, продукты и шаги. Если перед этим открыть раздел, рецепт ляжет на эту полку.',
    '',
    'В беседе отвечаю, если в сообщении есть «рецепт», моё имя, ответ на моё сообщение или упоминание сообщества.',
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
  if (['избранное', 'избранные'].includes(value)) return 'favorites';
  if (['покупки', 'список покупок', 'что купить', 'список'].includes(value)) return 'shop';
  if (['по шагам', 'шаги', 'шаг', 'сначала', 'с начала', 'готовить по шагам'].includes(value)) return 'steps';
  if (['дальше', 'далее', 'следующий', 'следующий шаг'].includes(value)) return 'next';
  if (['сохрани в базу', 'в базу'].includes(value)) return 'keep';
  if (['моя база', 'база'].includes(value)) return 'base';
  if (['сохрани', 'в избранное', 'избранное сохранить'].includes(value)) return 'save';
  if (['еще вариант', 'другой вариант', 'другой рецепт'].includes(value)) return 'another';
  if (['поделиться', 'на стену'].includes(value)) return value === 'на стену' ? 'wall' : 'share';
  if (['мой рецепт', 'свой рецепт'].includes(value)) return 'myrecipe';
  if (['что приготовить', 'блюдо'].includes(value)) return 'dish';
  if (value === 'рецепт') return 'dish';
  if (['из продуктов', 'из того что есть', 'продукты'].includes(value)) return 'ingredients';
  if (['быстрый ужин', 'быстро'].includes(value)) return 'quick';
  if (['диета', 'по диете', 'ограничение'].includes(value)) return 'diet';
  if (['случайный', 'случайный рецепт', 'случайное блюдо', 'идея'].includes(value)) return 'random';
  if (['из того, что есть', 'из того что есть'].includes(value)) return 'ingredients';
  if (['диетическое'].includes(value)) return 'diet';
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
  return /рецепт|кухн|повар|приготов/.test(value);
}

function readServings(text) {
  const value = normalize(text);
  let match = value.match(/(?:^|\s)(?:на|для)\s*(\d{1,2})(?:\s*(?:порц|персон|чел)[а-я]*)?/);
  if (!match) match = value.match(/^(\d{1,2})$/);
  if (!match) match = value.match(/^(\d{1,2})\s*(?:порц|персон|чел)/);
  if (!match) {
    if (value === 'как есть' || value === 'как в рецепте') return 0;
    return null;
  }
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n < 1 || n > 20) return null;
  return n;
}

function stripServings(text) {
  return String(text || '')
    .replace(/(^|\s)(?:на|для)\s*\d{1,2}(?:\s*(?:порц|персон|чел)[а-яё]*)?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanDish(text) {
  return stripServings(text).replace(/^(?:рецепт|как приготовить|как сделать)\s+/i, '').trim();
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
  return { user, messages: [say(shown(welcomeText(ctx && ctx.botName), ctx), menuKeyboard())], job: null };
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

function showFavorites(user) {
  user.mode = 'menu';
  user.draft = {};
  if (!user.favorites.length) {
    return { user, messages: [say('Избранное пока пусто. После рецепта нажмите «В избранное».', menuKeyboard())], job: null };
  }
  const lines = user.favorites.map((item, index) => `${index + 1}. ${item.title}`);
  const text = `Избранное:\n${lines.join('\n')}\n\nОткройте кнопкой или напишите «открой 1». «удали 2» убирает рецепт.`;
  return { user, messages: [say(text, favoritesKeyboard(user.favorites))], job: null };
}

function openFavorite(user, index) {
  if (!Number.isInteger(index) || index < 0 || !user.favorites[index]) {
    return { user, messages: [say('Такого номера в избранном нет.', favoritesKeyboard(user.favorites))], job: null };
  }
  const item = user.favorites[index];
  user.lastRecipe = structuredClone(item.recipe);
  user.stepIndex = 0;
  user.mode = 'menu';
  return { user, messages: [say(formatRecipe(item.recipe), recipeKeyboard(item.recipe))], job: null };
}

function deleteFavorite(user, index) {
  if (!Number.isInteger(index) || !user.favorites[index]) {
    return { user, messages: [say('Такого номера в избранном нет.', favoritesKeyboard(user.favorites))], job: null };
  }
  const [gone] = user.favorites.splice(index, 1);
  const keyboard = user.favorites.length ? favoritesKeyboard(user.favorites) : menuKeyboard();
  return { user, messages: [say(`Убрала «${gone.title}» из избранного.`, keyboard)], job: null };
}

function saveFavorite(user, now) {
  user.mode = 'menu';
  if (!user.lastRecipe) return noRecipe(user);
  const title = user.lastRecipe.title || 'Рецепт';
  const existing = user.favorites.findIndex(item => normalize(item.title) === normalize(title));
  user.favSeq = (user.favSeq || 0) + 1;
  const entry = {
    id: `f${user.favSeq}`,
    title,
    recipe: structuredClone(user.lastRecipe),
    savedAt: now.toISOString()
  };
  if (existing >= 0) user.favorites.splice(existing, 1, entry);
  else user.favorites.push(entry);
  if (user.favorites.length > 15) user.favorites.splice(0, user.favorites.length - 15);
  return { user, messages: [say(`Сохранила «${title}». Открыть можно в «Избранное».`, recipeKeyboard(user.lastRecipe))], job: null };
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
  if (job.kind === 'section' && job.data && job.data.section) user.lastCategory = job.data.section;
  else if (job.kind !== 'followup') user.lastCategory = '';
  user.lastQuery = String(job.memory || '');
  return { user, messages: [say(job.ask, backKeyboard())], job };
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
  if (!dishNameOk(name) || vagueDish(name, id)) return openSection(user, id);
  const data = {
    section: id,
    title: node.title,
    brief: node.brief,
    dish: name,
    servings: servings == null ? 0 : servings,
    text: [node.title, name].filter(Boolean).join('. ')
  };
  return jobReply(user, aiJob('section', data, SEEK));
}

function fromSectionDish(user, id, text) {
  const servings = readServings(text);
  const name = cleanDish(text);
  if (!dishNameOk(name) || vagueDish(name, id)) {
    return { user, messages: [say('Напишите конкретное блюдо в этом разделе. Одной кнопки раздела мало.', sectionKeyboard(id) || menuKeyboard())], job: null };
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
  const ask = SEEK;
  return jobReply(user, aiJob(kind, draft, ask));
}

function dishNameOk(name) {
  const value = normalize(name);
  return value.length >= 3 && !['ок', 'окей', 'да', 'нет', 'ага'].includes(value);
}

function fromDishText(user, text) {
  const servings = readServings(text);
  const name = cleanDish(text);
  if (!dishNameOk(name)) {
    return { user, messages: [say('Напишите название блюда, например «сырники» или «борщ на 6».', backKeyboard())], job: null };
  }
  if (servings == null) return askServings(user, { kind: 'dish', dish: name });
  return jobReply(user, aiJob('dish', { dish: name, servings }, SEEK));
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
  return jobReply(user, aiJob('ingredients', { products, servings }, SEEK));
}

function fromQuick(user, minutes) {
  const n = Number(minutes);
  if (!Number.isInteger(n) || n < 5 || n > 180) return beginQuick(user);
  return jobReply(user, aiJob('quick', { minutes: n }, SEEK));
}

function fromDiet(user, code) {
  const diet = DIETS[code];
  if (!diet) return beginDiet(user);
  return jobReply(user, aiJob('diet', { diet, code }, SEEK));
}

function dietFromText(text) {
  const value = normalize(text);
  const hit = DIET_WORDS.find(pair => value.includes(pair[0]));
  return hit ? hit[1] : '';
}

function fromRandom(user) {
  const theme = THEMES[((user.usageCount || 0) + (user.favorites || []).length) % THEMES.length];
  return jobReply(user, aiJob('random', { theme }, SEEK));
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
  const node = sectionById(category);
  user.mode = 'menu';
  user.lastCategory = category;
  user.pendingShare = { title, body, source: 'own' };
  const where = node ? ` Раздел: «${node.title}». В других разделах он не всплывёт.` : ' Раздел не выбран, поэтому по полкам он не ищется — только по точному названию.';
  return {
    user,
    messages: [say(`Сохранила «${title}» в общую базу.${where}\n\nЕго можно переслать из этой переписки или нажать «На стену».`, shareKeyboard())],
    job: null,
    share: { title, body, source: 'own' },
    catalog: { category, title, query: title, recipe: null, body, source: 'own' }
  };
}

function keepInBase(user) {
  if (!user.lastRecipe) return noRecipe(user);
  const title = user.lastRecipe.title || 'Рецепт';
  const category = user.lastCategory || '';
  const node = sectionById(category);
  const where = node ? ` в раздел «${node.title}»` : '';
  return {
    user,
    messages: [say(`Сохранила «${title}» в общую базу${where}. В другом разделе этот рецепт не покажется.`, recipeKeyboard(user.lastRecipe))],
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

function openHub(user, id) {
  const text = hubText(id);
  const keyboard = hubKeyboard(id);
  if (!text || !keyboard) return { user, messages: [say('Такого раздела нет.', menuKeyboard())], job: null };
  user.mode = 'menu';
  user.draft = {};
  return { user, messages: [say(text, keyboard)], job: null };
}

function routeFreeText(user, text) {
  const favorite = favoriteCommand(text);
  if (favorite) return favorite.op === 'delete' ? deleteFavorite(user, favorite.index) : openFavorite(user, favorite.index);
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
    if (looksLikeIngredients(text)) return fromIngredientsText(user, text);
    const quickHere = wantsQuick(text);
    if (quickHere) return fromQuick(user, quickHere);
    return fromSectionDish(user, user.draft.section, text);
  }
  const picked = namedSection(user, text);
  if (picked) return picked;
  const hasRecipe = !!user.lastRecipe;
  if (followUp(text, hasRecipe)) return fromFollow(user, text);
  if (user.mode !== 'steps' && looksLikeIngredients(text)) return fromIngredientsText(user, text);
  const quick = wantsQuick(text);
  if (quick) return fromQuick(user, quick);
  const servings = readServings(text);
  const dish = cleanDish(text);
  if (servings != null && dishNameOk(dish)) return jobReply(user, aiJob('dish', { dish, servings }, SEEK));
  if (/^(?:рецепт|как приготовить|как сделать)(?:\s|$)/i.test(text) && dishNameOk(dish)) {
    return jobReply(user, aiJob('dish', { dish, servings: 0 }, SEEK));
  }
  if (dishNameOk(dish)) return fromChat(user, text);
  return { user, messages: [say('Напишите блюдо или продукты. «Помощь» покажет примеры.', menuKeyboard())], job: null };
}

function turn(user, input, ctx) {
  const source = user ? structuredClone(user) : blankUser((input && input.userId) || '0');
  if (!Array.isArray(source.favorites)) source.favorites = [];
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
  if (payload && payload.a === 'hub') return openHub(source, String(payload.h || ''));
  if (payload && payload.a === 'open') return openFavorite(source, Number(payload.i));
  const hub = !payload && hubByText(text);
  if (hub) return openHub(source, hub);
  const action = actionOf(text, payload);
  if (action === 'menu') return menuTurn(source, ctx);
  if (action === 'help') {
    source.mode = 'menu';
    source.draft = {};
    return { user: source, messages: [say(shown(helpText(ctx && ctx.communityName), ctx), menuKeyboard())], job: null };
  }
  if (action === 'favorites') return showFavorites(source);
  if (action === 'shop') return showShop(source);
  if (action === 'steps') return showStep(source, 0);
  if (action === 'next') return showStep(source, (source.stepIndex || 0) + (source.mode === 'steps' ? 1 : 0));
  if (action === 'save') return saveFavorite(source, (ctx && ctx.now) || new Date());
  if (action === 'keep') return keepInBase(source);
  if (action === 'base') return showBase(source);
  if (action === 'another') {
    if (source.lastRecipe) return fromFollow(source, `Другой вариант вместо «${source.lastRecipe.title}». Не повторяй это блюдо.`);
    return fromRandom(source);
  }
  if (action === 'dish') return beginDish(source);
  if (action === 'ingredients') return beginIngredients(source);
  if (action === 'quick') return beginQuick(source);
  if (action === 'diet') return openSection(source, 'diet');
  if (action === 'random') return fromRandom(source);
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
  const recipe = parseRecipe(raw);
  const answer = recipe ? formatRecipe(recipe) : (asPlain(raw) || 'Не разобрала ответ. Напишите запрос ещё раз, можно короче.');
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
  if (found && found.recipe) {
    const done = complete(user, nextJob, JSON.stringify(found.recipe), Object.assign({}, ctx, { saved: true }));
    if (done.messages[0]) done.messages[0].text = `Нашла в базе.\n\n${done.messages[0].text}`;
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
    messages: [{ text: shown(`Нашла в базе.\n\n${body}`, ctx, nextJob.memory), keyboard: menuKeyboard() }],
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
  DIETS,
  THEMES
};
