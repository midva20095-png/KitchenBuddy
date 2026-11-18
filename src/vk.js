'use strict';

const crypto = require('crypto');

const API = 'https://api.vk.com/method';
const VERSION = '5.199';

class VkError extends Error {
  constructor(code, message) {
    super(message || 'vk');
    this.code = code;
  }
}

function connectHint(error) {
  const code = Number(error && error.code);
  const msg = String((error && error.message) || '');
  if (/longpoll for this group is not enabled/i.test(msg)) return 'В сообществе выключен Long Poll API.';
  if (code === 5) return 'Ключ сообщества не принят. Создайте новый, с правом «Управление».';
  if (code === 15) return 'У ключа сообщества нет права «Управление».';
  if (code === 27 || code === 28) return 'Это не ключ сообщества. Нужен ключ доступа сообщества.';
  if (code === 100) return 'Проверьте номер сообщества и включённый Long Poll API.';
  return 'Проверьте ключ сообщества и Long Poll API.';
}

function firstGroup(info) {
  if (!info) return null;
  if (Array.isArray(info.groups) && info.groups.length) return info.groups[0];
  if (Array.isArray(info) && info.length) return info[0];
  if (info.id) return info;
  return null;
}

function createVk(options) {
  const axios = (options && options.axios) || require('axios');
  const api = {
    token: String((options && options.token) || '').trim(),
    groupId: String((options && options.groupId) || '').replace(/\D/g, ''),
    version: (options && options.version) || VERSION,
    axios,

    async call(method, params) {
      const body = new URLSearchParams();
      Object.entries(params || {}).forEach(([key, value]) => {
        if (value == null || value === '') return;
        body.set(key, String(value));
      });
      body.set('access_token', this.token);
      body.set('v', this.version);
      const res = await this.axios.post(`${API}/${method}`, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 30000
      });
      const data = (res && res.data) || {};
      if (data.error) throw new VkError(data.error.error_code, data.error.error_msg || 'vk');
      return data.response;
    },

    async profile(userId) {
      const id = String(userId || '').replace(/\D/g, '');
      if (!id) return null;
      const response = await this.call('users.get', {
        user_ids: id,
        fields: 'screen_name,photo_100',
        lang: '0'
      });
      const user = Array.isArray(response) ? response[0] : null;
      if (!user) return null;
      const name = [user.first_name, user.last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      if (!name) return null;
      return {
        name: name.slice(0, 80),
        username: String(user.screen_name || '').slice(0, 64),
        photo: String(user.photo_100 || '').slice(0, 300)
      };
    },

    async isMember(userId) {
      const id = String(userId || '').replace(/\D/g, '');
      if (!id || !this.groupId) return true;
      const response = await this.call('groups.isMember', { group_id: this.groupId, user_id: id });
      if (response && typeof response === 'object') return Number(response.member) === 1;
      return Number(response) === 1;
    },

    async resolveGroup() {
      try {
        const info = await this.call('groups.getById', {});
        const group = firstGroup(info);
        const id = group && String(group.id || '').replace(/\D/g, '');
        if (id) return { id, name: String(group.name || '').trim() };
      } catch (error) {}
      return { id: this.groupId, name: '' };
    },

    async longPollServer() {
      return this.call('groups.getLongPollServer', { group_id: this.groupId });
    },

    async poll(server) {
      const res = await this.axios.get(server.server, {
        params: { act: 'a_check', key: server.key, ts: server.ts, wait: 25 },
        timeout: 35000,
        validateStatus: () => true
      });
      const data = res && res.data && typeof res.data === 'object' ? res.data : {};
      if (data.failed === 1 && data.ts) {
        return { restart: false, server: Object.assign({}, server, { ts: data.ts }), updates: [] };
      }
      if (data.failed) return { restart: true, server, updates: [] };
      return {
        restart: false,
        server: Object.assign({}, server, { ts: data.ts || server.ts }),
        updates: Array.isArray(data.updates) ? data.updates : []
      };
    },

    async send(peerId, message, keyboard) {
      const params = {
        peer_id: String(peerId),
        random_id: String(crypto.randomInt(1, 2000000000)),
        message: String(message || '').slice(0, 3500)
      };
      if (keyboard) params.keyboard = keyboard;
      try {
        return await this.call('messages.send', params);
      } catch (error) {
        const code = Number(error && error.code);
        if (keyboard && (code === 911 || code === 912)) {
          const plain = Object.assign({}, params, { random_id: String(crypto.randomInt(1, 2000000000)) });
          delete plain.keyboard;
          return this.call('messages.send', plain);
        }
        throw error;
      }
    },

    async typing(peerId) {
      await this.call('messages.setActivity', { peer_id: String(peerId), type: 'typing' });
    },

    async ownedList(method, groupId, extra, step, cap) {
      const id = String(groupId || '').replace(/\D/g, '');
      if (!id) return [];
      const size = step || 100;
      const limit = cap || 300;
      const items = [];
      for (let offset = 0; items.length < limit; offset += size) {
        const response = await this.call(method, Object.assign({
          owner_id: `-${id}`,
          count: String(size),
          offset: String(offset)
        }, extra || {}));
        const page = response && Array.isArray(response.items) ? response.items : [];
        items.push(...page);
        const total = response && Number(response.count);
        if (page.length < size) break;
        if (Number.isFinite(total) && offset + page.length >= total) break;
      }
      return items.slice(0, limit);
    },

    async wallPosts(groupId) {
      return this.ownedList('wall.get', groupId, { filter: 'owner' }, 100, 1200);
    },

    async donutPosts(groupId) {
      return this.ownedList('wall.get', groupId, { filter: 'donut' }, 100, 300);
    },

    async articles(groupId) {
      return this.ownedList('articles.getOwnerPublished', groupId, { sort_by: 'date' }, 30, 200);
    },

    async videos(groupId) {
      return this.ownedList('video.get', groupId, {}, 100, 200);
    },

    async albums(groupId) {
      return this.ownedList('photos.getAlbums', groupId, {}, 100, 100);
    },

    async goods(groupId) {
      return this.ownedList('market.get', groupId, {}, 100, 200);
    },

    async groupMenu(groupId) {
      const id = String(groupId || '').replace(/\D/g, '');
      if (!id) return [];
      const info = await this.call('groups.getById', { group_ids: id, fields: 'menu' });
      const group = firstGroup(info);
      const items = group && group.menu && Array.isArray(group.menu.items) ? group.menu.items : [];
      return items;
    },

    async post(text) {
      const groupId = this.groupId;
      const response = await this.call('wall.post', {
        owner_id: String(-Number(groupId)),
        from_group: '1',
        message: String(text || '').slice(0, 4000)
      });
      return response && response.post_id ? String(response.post_id) : '';
    },

    async comment(input, text) {
      const groupId = this.groupId;
      await this.call('wall.createComment', {
        owner_id: String(-Number(groupId)),
        post_id: String(input.postId),
        reply_to_comment: input.replyTo ? String(input.replyTo) : '',
        message: String(text || '').slice(0, 500),
        from_group: '1',
        guid: `kb${input.commentId}`.slice(0, 32)
      });
    },

    async enable() {
      const groupId = this.groupId;
      try {
        await this.call('groups.setSettings', {
          group_id: groupId,
          messages: '1',
          bots_capabilities: '1',
          bots_start_button: '1',
          bots_add_to_chat: '1'
        });
      } catch (error) {
        try { await this.call('groups.edit', { group_id: groupId, messages: '1' }); } catch (e) {}
      }
      try {
        await this.call('groups.setLongPollSettings', {
          group_id: groupId,
          enabled: '1',
          api_version: this.version,
          message_new: '1',
          message_event: '1',
          wall_reply_new: '1'
        });
      } catch (error) {}
    }
  };
  return api;
}

module.exports = { createVk, connectHint, VkError, API, VERSION };
