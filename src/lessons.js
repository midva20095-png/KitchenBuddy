'use strict';

const fs = require('fs');
const { normalize } = require('./text');

function loadLessons(file) {
  if (!file) return [];
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data.filter(item => item && item.title && item.url);
}

function stems(text) {
  return normalize(text)
    .split(/[^a-zа-я0-9]+/i)
    .map(word => word.slice(0, 5))
    .filter(word => word.length >= 4);
}

function matchLesson(query, lessons) {
  const words = stems(query);
  if (!words.length || !Array.isArray(lessons) || !lessons.length) return null;
  let best = null;
  let score = 0;
  let longest = 0;
  for (const lesson of lessons) {
    const hay = new Set(stems(`${lesson.title || ''} ${lesson.keys || ''}`));
    let n = 0;
    let long = 0;
    for (const word of words) {
      if (!hay.has(word)) continue;
      n += 1;
      if (word.length > long) long = word.length;
    }
    if (n > score || (n === score && long > longest)) {
      score = n;
      longest = long;
      best = lesson;
    }
  }
  if (score >= 2 || longest >= 5) return best;
  return null;
}

module.exports = { loadLessons, matchLesson };
