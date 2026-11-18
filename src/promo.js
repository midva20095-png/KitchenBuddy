'use strict';

const PROJECTS = [
  ['ЯгаГенератор', 'https://vk.ru/club236645486'],
  ['НейроЯга', 'https://vk.ru/neuroyaga'],
  ['Баба Яга', 'https://vk.ru/babyagaland'],
  ['Точки и линии', 'https://vk.ru/tochki_linii']
];

function promoFooter(options) {
  const lesson = options && options.lesson;
  const lines = [];
  if (lesson && lesson.url && lesson.title) {
    const kind = lesson.kind === 'masterclass' ? 'мастер-класс' : 'рецепт';
    lines.push(`Рекомендую ${kind}: ${String(lesson.title).trim()}`);
    lines.push(String(lesson.url).trim());
    lines.push('');
  }
  lines.push('Мои проекты:');
  for (const pair of PROJECTS) lines.push(`${pair[0]} — ${pair[1]}`);
  return lines.join('\n');
}

function withPromo(text, options) {
  const body = String(text || '').trim();
  if (!body) return promoFooter(options);
  if (body.includes('https://vk.ru/neuroyaga')) return body;
  const footer = promoFooter(options);
  const limit = options && options.compact ? 500 : 3500;
  const room = Math.max(40, limit - footer.length - 2);
  const cut = body.length > room ? `${body.slice(0, room - 1).trimEnd()}…` : body;
  return `${cut}\n\n${footer}`;
}

module.exports = { PROJECTS, promoFooter, withPromo };
