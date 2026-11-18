'use strict';

const API = 'https://api.vk.com/method';
const VERSION = '5.199';

function readWebToken(html) {
  const match = String(html || '').match(/"access_token":"(anonym\.[^"]+)"/);
  return match ? match[1] : '';
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
  if (!groupId) return { articles: [], problems: [] };
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
  const articles = await readPart(
    'статьи',
    () => listItems(axios, token, 'articles.getOwnerPublished', { owner_id: owner, sort_by: 'date' }, 30, 200, false),
    problems
  );
  return { articles, problems };
}

module.exports = { readWebToken, loadPublicCatalog };
