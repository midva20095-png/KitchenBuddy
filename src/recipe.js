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
  return {
    title: (clean(json.title) || 'Рецепт').slice(0, 120),
    time: asTime(json.time),
    servings: asServings(json.servings),
    ingredients,
    steps,
    tip: clean(json.tip).slice(0, 300)
  };
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
  if (recipe.tip) lines.push('', `Совет: ${recipe.tip}`);
  return clip(lines.join('\n'), 3500);
}

function formatShopping(recipe) {
  if (!recipe.ingredients.length) return `Для «${recipe.title}» отдельные продукты не указаны.`;
  const lines = [`Список покупок — ${recipe.title}`, ''];
  recipe.ingredients.forEach(item => lines.push(`• ${item}`));
  lines.push('', 'Соль, масло и базовые специи проверьте по дому.');
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
  return clip(`${body}${extra}`, 500);
}

module.exports = {
  parseRecipe,
  asPlain,
  formatRecipe,
  formatShopping,
  formatStep,
  commentBody
};
