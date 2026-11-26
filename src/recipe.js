'use strict';

const { clip, portions } = require('./text');

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').replace(/\*\*/g, '').trim();
}

function asList(value) {
  const list = Array.isArray(value) ? value : (value ? [value] : []);
  return list.map(item => {
    if (item && typeof item === 'object') {
      const amount = clean(item.amount || item.count || '');
      const name = clean(item.name || item.title || item.product || '');
      return [amount, name].filter(Boolean).join(' ');
    }
    return clean(item);
  }).map(item => item.replace(/^[-•–]\s*/, '').replace(/^\d+[.)]\s*/, '')).filter(Boolean);
}

function asTime(value) {
  const text = clean(value);
  if (/^\d{1,3}$/.test(text)) return `${text} минут`;
  return text.slice(0, 40);
}

function asServings(value) {
  const text = clean(value);
  if (/^\d{1,2}$/.test(text)) return portions(Number(text));
  return text.slice(0, 40);
}

function extractJson(text) {
  const fenced = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1] : String(text || '');
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(source.slice(start, end + 1));
  } catch (error) {
    return null;
  }
}

function parseRecipe(raw) {
  const text = String(raw || '').trim();
  if (!text || /^\s*TEXT:/i.test(text)) return null;
  const json = extractJson(text);
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const ingredients = asList(json.ingredients).slice(0, 30).map(item => item.slice(0, 160));
  const steps = asList(json.steps).slice(0, 12).map(item => item.slice(0, 400));
  if (!ingredients.length && !steps.length) return null;
  const shop = asList(json.shop || json.prices).slice(0, 16).map(item => item.slice(0, 120));
  return {
    title: (clean(json.title) || 'Рецепт').slice(0, 120),
    time: asTime(json.time),
    servings: asServings(json.servings),
    ingredients,
    steps,
    shop,
    total: clean(json.total).slice(0, 40),
    tip: clean(json.tip).slice(0, 300)
  };
}

function parseIdeas(raw) {
  const json = extractJson(raw);
  const list = json && Array.isArray(json.ideas) ? json.ideas : [];
  const ideas = [];
  const seen = new Set();
  for (const item of list) {
    const title = clean(item && (item.title || item.name) || '').slice(0, 80);
    const note = clean(item && (item.note || item.why) || '').slice(0, 120);
    const key = title.toLowerCase().replace(/ё/g, 'е');
    if (title.length < 3 || seen.has(key)) continue;
    seen.add(key);
    ideas.push({ title, note });
    if (ideas.length === 5) break;
  }
  return ideas;
}

function formatIdeas(ideas, topic) {
  const lines = [`В базе по запросу «${topic || 'эта тема'}» нашлись такие варианты.`, ''];
  (ideas || []).forEach((item, index) => {
    lines.push(`${index + 1}. ${item.title}${item.note ? ` — ${item.note}` : ''}`);
  });
  lines.push('', 'Напишите номер или название. Откроется рецепт этого блюда: шаги и что купить.');
  return lines.join('\n');
}

function titleFits(title, dish) {
  const skip = new Set(['рецепт', 'блюдо', 'пожалуйста', 'можно', 'хочу', 'нужно', 'давай', 'давайте', 'домашний', 'домашняя', 'простой', 'простая', 'вкусный', 'для', 'при', 'про', 'или', 'еще', 'это', 'как', 'что', 'чтобы']);
  const kind = new Set(['торт', 'торта', 'торты', 'тортик', 'пирог', 'пирога', 'пироги', 'кекс', 'кекса', 'десерт', 'выпечка', 'суп', 'супа', 'салат', 'каша']);
  const wish = /диабет|деобет|диет|болезн|веган|вегетар|постн|халял|кошер|глютен|аллерг|похуд|калор|инсулин|сыроед|пескетар|праздник/;
  const words = String(dish || '').toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/).filter(word => {
    return word.length >= 3 && !skip.has(word) && !wish.test(word);
  });
  if (!words.length) return true;
  const core = words.filter(word => !kind.has(word));
  const needed = core.length ? core : words;
  const hay = String(title || '').toLowerCase().replace(/ё/g, 'е');
  return needed.every(word => hay.includes(word.length > 6 ? word.slice(0, 6) : word));
}

function asPlain(raw) {
  const text = String(raw || '').trim().replace(/^\s*TEXT:\s*/i, '').replace(/\*\*/g, '').trim();
  if (!text || text.startsWith('{') || text.startsWith('```')) return '';
  return text;
}

function formatRecipe(recipe) {
  const lines = [`🍳 ${recipe.title}`];
  const meta = [recipe.time && `⏱ ${recipe.time}`, recipe.servings && `🍽 ${recipe.servings}`].filter(Boolean);
  if (meta.length) lines.push('', meta.join(' · '));
  if (recipe.ingredients.length) {
    lines.push('', 'Ингредиенты:');
    recipe.ingredients.forEach(item => lines.push(`• ${item}`));
  }
  if (recipe.steps.length) {
    lines.push('', 'Шаги:');
    recipe.steps.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  }
  if (recipe.shop && recipe.shop.length) {
    lines.push('', 'Покупки, примерно в «Магните» или «Пятёрочке»:');
    recipe.shop.forEach(item => lines.push(`• ${item}`));
    if (recipe.total) lines.push(`Итого ${recipe.total}.`);
  }
  if (recipe.tip) lines.push('', `Совет: ${recipe.tip}`);
  return clip(lines.join('\n'), 3500);
}

function formatShopping(recipe) {
  const lines = [`Список покупок — ${recipe.title}`, ''];
  const rows = recipe.shop && recipe.shop.length ? recipe.shop : recipe.ingredients;
  if (!rows || !rows.length) return `Для «${recipe.title}» отдельные продукты не указаны.`;
  rows.forEach(item => lines.push(`• ${item}`));
  if (recipe.total) lines.push('', `Итого ${recipe.total}.`);
  lines.push('', 'Цены примерные, «Магнит» или «Пятёрочка».');
  return clip(lines.join('\n'), 3500);
}

function formatStep(recipe, index) {
  const total = recipe.steps.length;
  return clip(`${recipe.title} · шаг ${index + 1} из ${total}\n\n${recipe.steps[index]}`, 3500);
}

function commentBody(raw, invite) {
  const source = String(raw || '').trim();
  if (!source) return '';
  let body = '';
  if (/^\s*TEXT:/i.test(source)) body = asPlain(source);
  else {
    const recipe = parseRecipe(source);
    if (recipe) {
      const step = recipe.steps[0] ? ` ${recipe.steps[0]}` : '';
      body = `${recipe.title}.${step}`.trim();
    } else body = asPlain(source);
  }
  if (!body) return '';
  const extra = invite && !/сообщества|vk\.me/i.test(body) ? `\n\n${invite}` : '';
  return clip(`${body}${extra}`, 280);
}

module.exports = {
  parseRecipe,
  parseIdeas,
  formatIdeas,
  titleFits,
  asPlain,
  formatRecipe,
  formatShopping,
  formatStep,
  commentBody
};
