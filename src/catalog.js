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

function recipeText(row) {
  const recipe = row && row.recipe && typeof row.recipe === 'object' ? row.recipe : {};
  const parts = [row && row.body, recipe.tip];
  if (Array.isArray(recipe.ingredients)) parts.push(recipe.ingredients.join(' '));
  if (Array.isArray(recipe.steps)) parts.push(recipe.steps.join(' '));
  return parts.filter(Boolean).join(' ');
}

function matchCatalog(rows, query) {
  const words = stems((query && (query.dish || query.text)) || '');
  if (!words.length) return null;
  const category = (query && query.category) || '';
  let best = null;
  let bestScore = -1;
  for (const row of rows || []) {
    if (!row || !sameShelf(row.category || '', category)) continue;
    const name = new Set(stems(`${row.title || ''} ${row.query || ''}`));
    const about = new Set(stems(recipeText(row)));
    let nameHits = 0;
    let aboutHits = 0;
    let found = true;
    for (const word of words) {
      if (name.has(word)) nameHits += 1;
      else if (about.has(word)) aboutHits += 1;
      else {
        found = false;
        break;
      }
    }
    if (!found) continue;
    const score = nameHits * 10 + aboutHits;
    if (!best || score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
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
  lines.push('', 'База общая. Поиск идёт по названию и по описанию, только внутри этой полки и соседних подразделов.');
  return lines.join('\n');
}

module.exports = { stems, sameShelf, matchCatalog, formatCatalog };
