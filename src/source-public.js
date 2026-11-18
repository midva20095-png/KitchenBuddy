'use strict';

const API = 'https://api.vk.com/method';
const VERSION = '5.199';

function readWebToken(html) {
  const match = String(html || '').match(/"access_token":"(anonym\.[^"]+)"/);
  return match ? match[1] : '';
}

function paywallTitle(post) {
  const snippet = post && post.donut && post.donut.paywall && post.donut.paywall.snippet;
  const title = snippet && String(snippet.title || '').replace(/\s+/g, ' ').trim();
  if (!title || !/[а-яё]/i.test(title)) return '';
  return title;
}

function withPaywall(post) {
  const title = paywallTitle(post);
  if (!post || !post.id || !title) return null;
  return Object.assign({}, post, {
    text: title,
    donut: Object.assign({}, post.donut, { is_donut: true })
  });
}

async function callApi(axios, token, method, params) {
  const body = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value == null || value === '') return;
    body.set(key, String(value));
  });
  body.set('access_token', token);
  body.set('v', VERSION);
  const res = await axios.post(`${API}/${method}`, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30000,
    validateStatus: () => true
  });
  const data = res && res.data && typeof res.data === 'object' ? res.data : {};
  if (data.error) {
    const error = new Error('vk');
    error.code = data.error.error_code;
    throw error;
  }
  return data.response;
}

async function listItems(axios, token, method, params, step, cap, sparse) {
  const items = [];
  let total = cap;
  let empty = 0;
  for (let offset = 0; items.length < cap && offset < total; offset += step) {
    const response = await callApi(axios, token, method, Object.assign({}, params, {
      count: String(step),
      offset: String(offset)
    }));
    const page = response && Array.isArray(response.items) ? response.items : [];
    const count = response && Number(response.count);
    if (Number.isFinite(count)) total = Math.min(cap, count);
    items.push(...page);
    if (!sparse) {
      if (page.length < step) break;
    } else if (!page.length) {
      empty += 1;
      if (empty >= 3) break;
    } else {
      empty = 0;
    }
  }
  return items.slice(0, cap);
}

async function readPart(title, load, problems) {
  try {
    return await load();
  } catch (error) {
    const code = error && error.code ? ` (${error.code})` : '';
    problems.push(`${title}${code}`);
    return [];
  }
}

async function loadPublicCatalog(options) {
  const axios = (options && options.axios) || require('axios');
  const groupId = String((options && options.groupId) || '').replace(/\D/g, '');
  if (!groupId) return { posts: [], donut: [], articles: [], videos: [], albums: [], goods: [], menu: [], problems: [] };
  const page = await axios.get(`https://vk.ru/club${groupId}`, {
    timeout: 20000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
    responseType: 'text',
    validateStatus: () => true
  });
  const token = readWebToken(page && page.data);
  if (!token) {
    const error = new Error('page');
    error.code = 'page';
    throw error;
  }
  const owner = `-${groupId}`;
  const problems = [];
  const [posts, rawDonut, articles, videos, playlists, goods, info] = await Promise.all([
    readPart('стена', () => listItems(axios, token, 'wall.get', { owner_id: owner, filter: 'owner' }, 100, 1200, false), problems),
    readPart('платные записи', () => listItems(axios, token, 'wall.get', { owner_id: owner, filter: 'donut' }, 100, 300, false), problems),
    readPart('статьи', () => listItems(axios, token, 'articles.getOwnerPublished', { owner_id: owner, sort_by: 'date' }, 30, 200, false), problems),
    readPart('видео', () => listItems(axios, token, 'video.get', { owner_id: owner }, 50, 200, true), problems),
    readPart('видеоальбомы', () => listItems(axios, token, 'video.getAlbums', { owner_id: owner }, 20, 20, false), problems),
    readPart('товары', () => listItems(axios, token, 'market.get', { owner_id: owner }, 100, 200, false), problems),
    readPart('меню', () => callApi(axios, token, 'groups.getById', { group_ids: groupId, fields: 'menu' }), problems)
  ]);
  const group = info && Array.isArray(info.groups) ? info.groups[0] : null;
  const menu = group && group.menu && Array.isArray(group.menu.items) ? group.menu.items : [];
  const lessons = playlists
    .filter(item => item && item.title && item.title !== 'Добавленные')
    .map(item => Object.assign({}, item, {
      url: `https://vk.ru/video/playlist/${item.owner_id}_${item.id}`,
      description: item.title
    }));
  return {
    posts,
    donut: rawDonut.map(withPaywall).filter(Boolean),
    articles,
    videos: videos.concat(lessons),
    albums: [],
    goods,
    menu,
    problems
  };
}

module.exports = { readWebToken, paywallTitle, loadPublicCatalog };
