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
    const paidTie = n === score && n > 0 && long === longest && lesson.kind === 'paid' && (!best || best.kind !== 'paid');
    if (n > score || (n === score && long > longest) || paidTie) {
      score = n;
      longest = long;
      best = lesson;
    }
  }
  if (score >= 2 || longest >= 5) return best;
  return null;
}

function isDonut(post) {
  return Boolean(post && post.donut && (post.donut.is_donut || post.donut.paid_duration));
}

function attachmentsOf(post) {
  const found = [];
  const groups = [post && post.attachments];
  const copies = post && Array.isArray(post.copy_history) ? post.copy_history : [];
  for (const copy of copies) {
    if (copy && copy.text) found.push({ type: 'text', text: copy.text });
    if (copy && Array.isArray(copy.attachments)) groups.push(copy.attachments);
  }
  for (const group of groups) {
    if (Array.isArray(group)) found.push(...group);
  }
  return found;
}

function plain(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function kindOf(text, fallback) {
  const source = String(text || '').toLowerCase();
  if (/мастер|урок|обучен|(?:^|[^а-яё])мк(?:[^а-яё]|$)/.test(source)) return 'masterclass';
  if (/стать/.test(source)) return 'article';
  return fallback || 'recipe';
}

function clipTitle(title, extra) {
  const raw = plain(title);
  if (/^video by\b/i.test(raw) || raw.length < 4) return plain(extra).split(/[.!\n]/)[0].slice(0, 80);
  return raw.slice(0, 80);
}

function vkUrl(url) {
  return plain(url).replace(/^https?:\/\/(?:m\.)?vk\.com\//i, 'https://vk.ru/').split('?')[0];
}

function postWords(post) {
  const parts = [post && post.text];
  for (const item of attachmentsOf(post)) {
    if (item.text) parts.push(item.text);
    if (item.article) parts.push(item.article.title, item.article.subtitle);
    if (item.video) parts.push(item.video.title, item.video.description);
    if (item.link) parts.push(item.link.title, item.link.description);
    if (item.photo && item.photo.text) parts.push(item.photo.text);
    if (item.doc && item.doc.title) parts.push(item.doc.title);
  }
  return plain(parts.filter(Boolean).join(' '));
}

function remember(lessons, seenTitle, seenUrl, item) {
  const title = clipTitle(item && item.title, item && item.keys);
  const url = plain(item && item.url);
  if (title.length < 4 || !/^https:\/\/vk\.ru\//.test(url)) return;
  const titleKey = title.toLowerCase();
  if (seenTitle.has(titleKey) || seenUrl.has(url)) return;
  seenTitle.add(titleKey);
  seenUrl.add(url);
  lessons.push({
    title,
    url,
    kind: item.kind || 'recipe',
    keys: plain(item.keys || title).slice(0, 400)
  });
}

function postsToLessons(posts, groupId) {
  const id = String(groupId || '').replace(/\D/g, '');
  if (!id) return [];
  const lessons = [];
  const seenTitle = new Set();
  const seenUrl = new Set();
  for (const post of posts || []) {
    if (!post || !post.id) continue;
    const own = plain(post.text);
    const text = postWords(post);
    if (isDonut(post)) {
      let title = own.length >= 8 ? own.split(/[.!\n]/)[0] : '';
      if (!title) {
        for (const item of attachmentsOf(post)) {
          const named = (item.video && item.video.title) || (item.article && (item.article.title || item.article.subtitle)) || (item.doc && item.doc.title);
          if (named && plain(named).length >= 4 && !/^video by\b/i.test(named)) {
            title = named;
            break;
          }
        }
      }
      remember(lessons, seenTitle, seenUrl, {
        title: title || text,
        url: `https://vk.ru/wall-${id}_${post.id}`,
        kind: 'paid',
        keys: text
      });
      continue;
    }
    if (own.length >= 8) {
      remember(lessons, seenTitle, seenUrl, {
        title: own.split(/[.!\n]/)[0],
        url: `https://vk.ru/wall-${id}_${post.id}`,
        kind: kindOf(text, 'recipe'),
        keys: text
      });
    }
    for (const item of attachmentsOf(post)) {
      if (item.article) {
        const keys = plain(`${item.article.title || ''} ${item.article.subtitle || ''}`);
        remember(lessons, seenTitle, seenUrl, {
          title: item.article.title || item.article.subtitle,
          url: vkUrl(item.article.view_url || item.article.url),
          kind: kindOf(keys, 'article'),
          keys
        });
      }
      if (item.video && item.video.id != null && item.video.owner_id != null) {
        const keys = plain(`${item.video.title || ''} ${item.video.description || ''}`);
        remember(lessons, seenTitle, seenUrl, {
          title: item.video.title,
          url: `https://vk.ru/video${item.video.owner_id}_${item.video.id}`,
          kind: kindOf(keys, 'video'),
          keys
        });
      }
      if (item.doc && item.doc.id != null && item.doc.owner_id != null && item.doc.title) {
        remember(lessons, seenTitle, seenUrl, {
          title: item.doc.title,
          url: `https://vk.ru/doc${item.doc.owner_id}_${item.doc.id}`,
          kind: kindOf(item.doc.title, 'material'),
          keys: item.doc.title
        });
      }
    }
  }
  return lessons;
}

const MENU_KIND = {
  article: 'article',
  video: 'video',
  photo_album: 'album',
  narrative: 'album',
  post: 'recipe',
  market: 'material'
};

function collectLessons(source, groupId) {
  const id = String(groupId || '').replace(/\D/g, '');
  if (!id) return [];
  const bundle = source || {};
  const lessons = postsToLessons(bundle.posts, id);
  const seenTitle = new Set(lessons.map(item => item.title.toLowerCase()));
  const seenUrl = new Set(lessons.map(item => item.url));
  for (const article of bundle.articles || []) {
    const keys = plain(`${article.title || ''} ${article.subtitle || ''}`);
    remember(lessons, seenTitle, seenUrl, {
      title: article.title || article.subtitle,
      url: vkUrl(article.view_url || article.url),
      kind: kindOf(keys, 'article'),
      keys
    });
  }
  for (const video of bundle.videos || []) {
    const keys = plain(`${video.title || ''} ${video.description || ''}`);
    remember(lessons, seenTitle, seenUrl, {
      title: video.title,
      url: video.url
        ? vkUrl(video.url)
        : (video.id != null && video.owner_id != null ? `https://vk.ru/video${video.owner_id}_${video.id}` : ''),
      kind: kindOf(keys, 'video'),
      keys
    });
  }
  for (const album of bundle.albums || []) {
    const keys = plain(`${album.title || ''} ${album.description || ''}`);
    remember(lessons, seenTitle, seenUrl, {
      title: album.title,
      url: album.id != null && album.owner_id != null ? `https://vk.ru/album${album.owner_id}_${album.id}` : '',
      kind: kindOf(keys, 'album'),
      keys
    });
  }
  for (const item of bundle.goods || []) {
    const keys = plain(`${item.title || ''} ${item.description || ''}`);
    remember(lessons, seenTitle, seenUrl, {
      title: item.title,
      url: item.id != null ? `https://vk.ru/market-${id}?w=product-${id}_${item.id}` : '',
      kind: kindOf(keys, 'material'),
      keys
    });
  }
  for (const item of bundle.menu || []) {
    const fallback = MENU_KIND[item && item.type];
    if (!fallback) continue;
    remember(lessons, seenTitle, seenUrl, {
      title: item.title,
      url: vkUrl(item.url),
      kind: kindOf(item.title, fallback),
      keys: item.title
    });
  }
  return lessons;
}

module.exports = { loadLessons, matchLesson, postsToLessons, collectLessons };
