'use strict';

const https = require('https');
const crypto = require('crypto');

const AUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const API_URL = 'https://api.giga.chat/v1/chat/completions';

const MODELS = {
  'giga-lite': 'GigaChat-2',
  'giga-pro': 'GigaChat-2-Pro',
  'giga-max': 'GigaChat-2-Max',
  'giga-ultra': 'GigaChat-3-Ultra'
};

function resolveModel(value) {
  const raw = String(value || '').trim();
  if (MODELS[raw]) return MODELS[raw];
  if (/^[A-Za-z0-9._-]{1,64}$/.test(raw)) return raw;
  return 'GigaChat-2';
}

function createGigaChat(options) {
  const env = (options && options.env) || process.env;
  const axios = (options && options.axios) || require('axios');
  const clock = (options && options.now) || Date.now;
  const key = String(env.GIGACHAT_AUTH_KEY || '').trim();
  const scope = /^[A-Z0-9_]+$/.test(env.GIGACHAT_SCOPE || '') ? env.GIGACHAT_SCOPE : 'GIGACHAT_API_PERS';
  const model = resolveModel(env.GIGACHAT_MODEL);
  // У хоста авторизации Сбера сертификат часто не входит в набор CA контейнера.
  const httpsAgent = (options && options.agent) || new https.Agent({ rejectUnauthorized: false });
  let token = '';
  let until = 0;

  async function getToken(force) {
    const now = clock();
    if (!force && token && now < until) return token;
    if (!key) {
      const error = new Error('Нет GIGACHAT_AUTH_KEY');
      error.code = 'NO_KEY';
      throw error;
    }
    const res = await axios.post(AUTH_URL, `scope=${scope}`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        RqUID: crypto.randomUUID(),
        Authorization: key.startsWith('Basic ') ? key : `Basic ${key}`
      },
      httpsAgent,
      timeout: 20000
    });
    const access = res && res.data && res.data.access_token;
    if (!access) {
      const error = new Error('Пустой токен GigaChat');
      error.code = 'NO_TOKEN';
      throw error;
    }
    token = access;
    until = clock() + 25 * 60 * 1000;
    return token;
  }

  function messagesOf(system, history, prompt) {
    const messages = [{ role: 'system', content: String(system || '') }];
    (history || []).forEach(item => {
      if (!item || (item.role !== 'user' && item.role !== 'assistant') || !item.content) return;
      messages.push({ role: item.role, content: String(item.content) });
    });
    messages.push({ role: 'user', content: String(prompt || '') });
    return messages;
  }

  async function complete({ system, history, prompt }) {
    const body = {
      model,
      messages: messagesOf(system, history, prompt),
      temperature: 0.6,
      max_tokens: 1400
    };
    async function once(force) {
      const access = await getToken(force);
      return axios.post(API_URL, body, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${access}`
        },
        httpsAgent,
        timeout: 60000
      });
    }
    let res;
    try {
      res = await once(false);
    } catch (error) {
      const status = error && error.response && error.response.status;
      if (status !== 401) throw error;
      token = '';
      until = 0;
      res = await once(true);
    }
    const text = res && res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message && res.data.choices[0].message.content;
    return String(text || '').trim();
  }

  return { complete, getToken, model, scope };
}

module.exports = { createGigaChat, resolveModel, AUTH_URL, API_URL, MODELS };
