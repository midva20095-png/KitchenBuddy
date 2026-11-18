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

function postWords(post) {
  const parts = [post && post.text];
  const attachments = (post && post.attachments) || [];
  for (const item of attachments) {
    if (item && item.video && item.video.title) parts.push(item.video.title);
    if (item && item.link && item.link.title) parts.push(item.link.title);
  }
  const copy = post && Array.isArray(post.copy_history) ? post.copy_history[0] : null;
  if (copy && copy.text) parts.push(copy.text);
  return parts.filter(Boolean).join('\n').replace(/\s+/g, ' ').trim();
}

function postsToLessons(posts, groupId) {
  const id = String(groupId || '').replace(/\D/g, '');
  if (!id) return [];
  const lessons = [];
  const seen = new Set();
  for (const post of posts || []) {
    if (!post || !post.id) continue;
    const text = postWords(post);
    if (text.length < 8) continue;
    const title = text.split(/[.!\n]/)[0].trim().slice(0, 80);
    if (title.length < 4 || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    const lesson = /мастер|урок|обучен/.test(text.toLowerCase());
    lessons.push({
      title,
      url: `https://vk.ru/wall-${id}_${post.id}`,
      kind: lesson ? 'masterclass' : 'recipe',
      keys: text.slice(0, 400)
    });
  }
  return lessons;
}

module.exports = { loadLessons, matchLesson, postsToLessons };
