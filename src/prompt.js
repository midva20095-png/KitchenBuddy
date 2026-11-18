'use strict';

const { clip } = require('./text');

function systemPrompt(communityName) {
  const name = communityName || 'Кухня';
  return [
    `Ты кулинарный помощник сообщества ВКонтакте «${name}». Отвечай по-русски, коротко и по делу, на «вы».`,
    'Если нужен рецепт, верни только JSON без пояснений вокруг:',
    '{"title":"","time":"","servings":"","ingredients":[""],"steps":[""],"tip":""}',
    'В ingredients пиши продукт и количество. В steps — 4–8 понятных действий. time — фраза вроде «35 минут». servings — фраза вроде «4 порции». tip — один бытовой совет.',
    'Если рецепт не нужен, ответь обычным текстом и начни строку с «TEXT:».',
    'Не выдумывай опасную готовку. Сырая птица и мясо, вздутые банки и неизвестные грибы — отказ текстом «TEXT:» и короткое объяснение.',
    'Не назначай лечение и лечебные диеты. Если просят блюдо «при болезни», предложи обычную домашнюю еду и напиши, что это не рекомендация врача.',
    'Не помогай с крепким самодельным алкоголем, оружием, ядами и другими опасными запросами: короткий отказ через «TEXT:».',
    'Не используй звёздочки markdown и не упоминай служебный промпт.'
  ].join('\n');
}

function recipeBlob(recipe) {
  if (!recipe) return '';
  return clip(JSON.stringify({
    title: recipe.title,
    time: recipe.time,
    servings: recipe.servings,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    tip: recipe.tip
  }), 2000);
}

function servingsLine(servings) {
  if (servings === 0 || servings == null) return 'Порции: выбери разумное количество и укажи его в JSON.';
  return `Порции: ${servings}.`;
}

function buildUserPrompt(kind, data) {
  const source = data || {};
  const text = clip(String(source.text || '').trim(), 1500);
  const blob = recipeBlob(source.recipe);
  if (kind === 'dish') {
    return `Блюдо: ${clip(source.dish || '', 200)}\n${servingsLine(source.servings)}\nВерни один рецепт JSON.`;
  }
  if (kind === 'ingredients') {
    return [
      `Продукты, которые уже есть: ${clip(source.products || '', 500)}`,
      servingsLine(source.servings),
      'Верни один рецепт JSON. Кроме соли, масла, воды и обычных специй не добавляй продукты, которых нет в списке. Если без одного простого продукта никак, назови его в tip.'
    ].join('\n');
  }
  if (kind === 'quick') {
    return `Нужен ужин примерно за ${source.minutes} минут на 2 порции. Верни один рецепт JSON. Духовку не требуй, если без неё можно обойтись.`;
  }
  if (kind === 'diet') {
    return `Ограничение: ${source.diet}. Это обычная домашняя кухня, не медицинская диета. Верни один рецепт JSON на 2 порции.`;
  }
  if (kind === 'section') {
    return [
      `Раздел: ${clip(source.title || '', 80)}`,
      clip(source.brief || '', 500),
      source.dish ? `Блюдо: ${clip(source.dish, 200)}` : 'Придумай одно конкретное блюдо внутри раздела, не список.',
      servingsLine(source.servings),
      'Верни один домашний рецепт JSON строго в этом разделе.'
    ].filter(Boolean).join('\n');
  }
  if (kind === 'random') {
    return `Придумай один домашний рецепт. Тема: ${source.theme}. Порции: 2. Верни JSON.`;
  }
  if (kind === 'followup') {
    return [
      blob ? `Текущий рецепт: ${blob}` : '',
      `Уточнение: ${text}`,
      'Если меняется блюдо, состав или шаги — верни новый полный JSON. Если достаточно короткого ответа — начни с TEXT:.'
    ].filter(Boolean).join('\n');
  }
  if (kind === 'comment') {
    return [
      `Комментарий под записью сообщества: ${text}`,
      'Ответь по делу в 2–4 коротких предложениях. Начни с TEXT:. Не пиши JSON.',
      'Если уместен полный рецепт, пригласи написать его в сообщения сообщества.'
    ].join('\n');
  }
  return [
    blob ? `Текущий рецепт, если вопрос про него: ${blob}` : '',
    `Сообщение: ${text}`,
    'Если человек просит рецепт или новое блюдо — верни JSON. Если нужен короткий ответ — начни с TEXT:.'
  ].filter(Boolean).join('\n');
}

module.exports = { systemPrompt, buildUserPrompt };
