'use strict';

const fs = require('fs/promises');
const path = require('path');
const { normalize } = require('./text');
const { matchCatalog } = require('./catalog');
const { familyIds } = require('./menu');

function catalogKey() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function createStore(dir) {
  const file = path.join(dir, 'kitchen.json');
  let chain = Promise.resolve();
  let memory = null;

  function enqueue(fn) {
    const run = chain.then(fn, fn);
    chain = run.then(() => {}, () => {});
    return run;
  }

  async function load() {
    if (memory) return memory;
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
      memory = parsed && typeof parsed === 'object' ? parsed : { users: {}, comments: [], cards: {}, shared: [] };
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Хранилище повреждено, начинаю заново.');
      memory = { users: {}, comments: [], cards: {}, shared: [] };
    }
    if (!memory.users || typeof memory.users !== 'object') memory.users = {};
    if (!Array.isArray(memory.comments)) memory.comments = [];
    if (!memory.cards || typeof memory.cards !== 'object') memory.cards = {};
    if (!Array.isArray(memory.shared)) memory.shared = [];
    if (!Array.isArray(memory.catalog)) memory.catalog = [];
    return memory;
  }

  async function persist() {
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(memory));
    await fs.rename(tmp, file);
  }

  return {
    getUser(id) {
      const key = String(id);
      return enqueue(async () => {
        const data = await load();
        return data.users[key] ? structuredClone(data.users[key]) : null;
      });
    },
    saveUser(user) {
      const key = String(user && user.id || '');
      return enqueue(async () => {
        if (!key) return;
        const data = await load();
        data.users[key] = structuredClone(user);
        await persist();
      });
    },
    hasComment(key) {
      return enqueue(async () => {
        const data = await load();
        return data.comments.includes(String(key));
      });
    },
    markComment(key) {
      const value = String(key);
      return enqueue(async () => {
        const data = await load();
        if (!data.comments.includes(value)) data.comments.push(value);
        if (data.comments.length > 400) data.comments.splice(0, data.comments.length - 400);
        await persist();
      });
    },
    ensureClient(userId, profile, groupId, extra) {
      const id = String(userId || '').replace(/\D/g, '');
      return enqueue(async () => {
        if (!id) return { isNew: false, blocked: false, name: '' };
        const data = await load();
        const count = extra && extra.count === false ? 0 : 1;
        const face = profile || {};
        let card = data.cards[id];
        const isNew = !card;
        if (!card) {
          card = {
            userId: id,
            name: '',
            username: '',
            photo: '',
            blocked: false,
            messages: 0,
            recipes: 0,
            groupId: '',
            createdAt: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            log: []
          };
          data.cards[id] = card;
        }
        card.messages += count;
        card.lastSeen = new Date().toISOString();
        if (face.name) card.name = String(face.name).slice(0, 80);
        if (face.username) card.username = String(face.username).slice(0, 64);
        if (face.photo) card.photo = String(face.photo).slice(0, 300);
        if (groupId) card.groupId = String(groupId).replace(/\D/g, '');
        await persist();
        return { isNew, blocked: Boolean(card.blocked), name: card.name || '' };
      });
    },
    note(userId, kind, body) {
      const id = String(userId || '').replace(/\D/g, '');
      return enqueue(async () => {
        if (!id || !kind) return;
        const data = await load();
        const card = data.cards[id];
        if (!card) return;
        card.log = (card.log || []).concat([{ kind: String(kind).slice(0, 40), body: String(body || '').slice(0, 300), at: new Date().toISOString() }]).slice(-40);
        if (kind === 'recipe') card.recipes += 1;
        await persist();
      });
    },
    saveShared(userId, share) {
      const id = String(userId || '').replace(/\D/g, '');
      return enqueue(async () => {
        const data = await load();
        data.shareSeq = (data.shareSeq || 0) + 1;
        const row = {
          id: String(data.shareSeq),
          userId: id,
          title: String((share && share.title) || 'Рецепт').slice(0, 80),
          body: String((share && share.body) || '').slice(0, 4000),
          source: (share && share.source) === 'bot' ? 'bot' : 'own',
          status: 'saved',
          postId: '',
          createdAt: new Date().toISOString()
        };
        data.shared.push(row);
        if (data.shared.length > 200) data.shared.splice(0, data.shared.length - 200);
        await persist();
        return { id: row.id };
      });
    },
    saveCatalog(userId, item) {
      const id = String(userId || '').replace(/\D/g, '');
      return enqueue(async () => {
        if (!id || !item) return null;
        const data = await load();
        const title = String(item.title || 'Рецепт').slice(0, 80);
        const category = String(item.category || '').slice(0, 40);
        const same = data.catalog.find(entry => entry.category === category && normalize(entry.title) === normalize(title));
        const row = {
          id: same && same.id ? String(same.id) : catalogKey(),
          userId: id,
          category,
          title,
          query: String(item.query || title).slice(0, 200),
          recipe: item.recipe && typeof item.recipe === 'object' ? item.recipe : null,
          body: String(item.body || '').slice(0, 4000),
          source: item.source === 'own' ? 'own' : 'found',
          createdAt: same && same.createdAt ? same.createdAt : new Date().toISOString()
        };
        if (same) {
          Object.assign(same, row);
        } else {
          data.catalog.push(row);
        }
        if (data.catalog.length > 2000) data.catalog.splice(0, data.catalog.length - 2000);
        await persist();
        return { title: row.title };
      });
    },
    findCatalog(userId, query) {
      return enqueue(async () => {
        const data = await load();
        const category = String((query && query.category) || '');
        const family = new Set(familyIds(category));
        const rows = data.catalog
          .filter(entry => !category || family.has(entry.category))
          .slice(-500)
          .reverse();
        return matchCatalog(rows, query);
      });
    },
    listCatalog() {
      return enqueue(async () => {
        const data = await load();
        let dirty = false;
        for (const entry of data.catalog) {
          if (!entry.id) {
            entry.id = catalogKey();
            dirty = true;
          }
        }
        if (dirty) await persist();
        return data.catalog.slice(-30).reverse().map(entry => ({
          id: String(entry.id),
          category: entry.category,
          title: entry.title,
          query: entry.query,
          source: entry.source
        }));
      });
    },
    getCatalog(id) {
      return enqueue(async () => {
        const key = String(id || '').replace(/[^\w-]/g, '').slice(0, 40);
        if (!key) return null;
        const data = await load();
        const entry = data.catalog.find(row => String(row.id || '') === key);
        if (!entry) return null;
        return {
          id: String(entry.id),
          category: entry.category || '',
          title: entry.title || '',
          query: entry.query || '',
          recipe: entry.recipe && typeof entry.recipe === 'object' ? entry.recipe : null,
          body: entry.body || '',
          source: entry.source || 'found'
        };
      });
    },
    markShared(id, postId) {
      return enqueue(async () => {
        const data = await load();
        const row = data.shared.find(item => String(item.id) === String(id));
        if (!row) return;
        row.status = 'posted';
        row.postId = String(postId || '');
        await persist();
      });
    },
    stats() {
      return enqueue(async () => {
        const data = await load();
        const cards = Object.values(data.cards);
        const day = new Date().toISOString().slice(0, 10);
        return {
          clients: cards.length,
          activeDay: cards.filter(item => String(item.lastSeen || '').slice(0, 10) === day).length,
          newDay: cards.filter(item => String(item.createdAt || '').slice(0, 10) === day).length,
          blocked: cards.filter(item => item.blocked).length,
          recipes: cards.reduce((sum, item) => sum + (item.recipes || 0), 0),
          shared: data.shared.length,
          engine: 'file'
        };
      });
    },
    listClients(query) {
      const needle = String(query || '').trim().toLowerCase();
      return enqueue(async () => {
        const data = await load();
        return Object.values(data.cards)
          .filter(item => !needle || `${item.userId} ${item.name} ${item.username}`.toLowerCase().includes(needle))
          .sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)))
          .slice(0, 100)
          .map(item => ({
            userId: item.userId,
            name: item.name || '',
            username: item.username || '',
            blocked: Boolean(item.blocked),
            messages: item.messages || 0,
            recipes: item.recipes || 0,
            createdAt: item.createdAt,
            lastSeen: item.lastSeen
          }));
      });
    },
    clientCard(userId) {
      const id = String(userId || '').replace(/\D/g, '');
      return enqueue(async () => {
        const data = await load();
        const card = data.cards[id];
        if (!card) return null;
        const state = data.users[id];
        const favorites = state && Array.isArray(state.favorites) ? state.favorites.map(item => item.title) : [];
        return {
          user: {
            userId: card.userId,
            name: card.name || '',
            username: card.username || '',
            photo: card.photo || '',
            blocked: Boolean(card.blocked),
            messages: card.messages || 0,
            recipes: card.recipes || 0,
            groupId: card.groupId || '',
            createdAt: card.createdAt,
            lastSeen: card.lastSeen
          },
          favorites,
          log: (card.log || []).slice().reverse(),
          shared: data.shared.filter(item => item.userId === id).slice(-20).reverse()
        };
      });
    },
    setBlocked(userId, blocked) {
      const id = String(userId || '').replace(/\D/g, '');
      return enqueue(async () => {
        const data = await load();
        if (!data.cards[id]) return false;
        data.cards[id].blocked = Boolean(blocked);
        await persist();
        return data.cards[id].blocked;
      });
    },
    listShared() {
      return enqueue(async () => {
        const data = await load();
        return data.shared.slice(-50).reverse().map(item => ({
          id: item.id,
          userId: item.userId,
          name: (data.cards[item.userId] && data.cards[item.userId].name) || '',
          title: item.title,
          source: item.source,
          status: item.status,
          postId: item.postId,
          createdAt: item.createdAt
        }));
      });
    }
  };
}

module.exports = { createStore };
