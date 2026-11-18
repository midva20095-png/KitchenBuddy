'use strict';

const { normalize } = require('./text');
const { sectionById, familyIds } = require('./menu');

const STOP = ['рецепт', 'блюдо', 'домаш', 'пригот', 'порци', 'пожалу', 'быстр', 'ужин', 'обед', 'вкусн', 'напиш'];

function skipped(word) {
  return STOP.some(item => word.startsWith(item));
}

function stems(text) {
  return normalize(text)
    .split(/[^a-zа-я0-9]+/)
    .map(word => word.slice(0, 8))
    .filter(word => word.length >= 4 && !skipped(word));
}

function climb(id, target) {
  let cursor = sectionById(id);
  const seen = new Set();
  while (cursor && !seen.has(cursor.id)) {
    if (cursor.id === target) return true;
    seen.add(cursor.id);
    cursor = cursor.parent ? sectionById(cursor.parent) : null;
  }
  return false;
}

function sameShelf(saved, context) {
  if (!context) return true;
  if (!saved) return false;
  if (saved === context) return true;
  if (climb(saved, context) || climb(context, saved)) return true;
  return familyIds(context).includes(saved);
}

function matchCatalog(rows, query) {
  const words = stems((query && (query.dish || query.text)) || '');
  if (!words.length) return null;
  const category = (query && query.category) || '';
  let best = null;
  let long = 0;
  for (const row of rows || []) {
    if (!row || !sameShelf(row.category || '', category)) continue;
    const hay = new Set(stems(`${row.title || ''} ${row.query || ''}`));
    if (!words.every(word => hay.has(word))) continue;
    const local = words.reduce((max, word) => Math.max(max, word.length), 0);
    if (!best || local > long) {
      best = row;
      long = local;
    }
  }
  if (!best || long < 4) return null;
  return best;
}

function formatCatalog(rows) {
  const list = rows || [];
  if (!list.length) {
    return 'В базе пока пусто. Готовый рецепт попадает сюда сам. Свой текст присылают через «Мой рецепт» из нужного раздела.';
  }
  const lines = ['База рецептов.'];
  list.slice(0, 15).forEach((row, index) => {
    const node = sectionById(row.category);
    const where = node ? ` · ${node.short || node.title}` : '';
    lines.push(`${index + 1}. ${row.title || 'Рецепт'}${where}`);
  });
  lines.push('', 'База общая. В разделе бот ищет только рецепты этой полки и соседних подразделов.');
  return lines.join('\n');
}

module.exports = { stems, sameShelf, matchCatalog, formatCatalog };
