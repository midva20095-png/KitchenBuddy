'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createClients, poolConfig } = require('../src/clients');
const { blankUser } = require('../src/dialog');

function memoryPool() {
  const clients = new Map();
  const groups = new Set();
  const state = new Map();
  const log = [];
  const comments = new Set();
  return {
    clients,
    groups,
    log,
    async query(sql, params) {
      const text = sql.replace(/\s+/g, ' ').trim();
      if (text.startsWith('CREATE')) return { rows: [] };
      if (text.startsWith('SELECT COUNT')) return { rows: [{ n: clients.size }] };
      if (text.startsWith('INSERT INTO clients')) {
        if (clients.has(params[0])) return { rows: [] };
        clients.set(params[0], {
          name: params[1] || '',
          username: params[2] || '',
          photo: params[3] || '',
          blocked: false,
          messages: params[4],
          recipes: 0
        });
        return { rows: [{ user_id: params[0] }] };
      }
      if (text.startsWith('UPDATE clients SET')) {
        const row = clients.get(params[0]);
        if (!row) return { rows: [] };
        if (text.includes('recipes = recipes')) {
          row.recipes += 1;
          return { rows: [] };
        }
        row.messages += params[4];
        if (params[1]) row.name = params[1];
        if (params[2]) row.username = params[2];
        if (params[3]) row.photo = params[3];
        return { rows: [] };
      }
      if (text.startsWith('SELECT name, blocked')) {
        const row = clients.get(params[0]);
        return { rows: row ? [{ name: row.name, blocked: row.blocked }] : [] };
      }
      if (text.startsWith('INSERT INTO client_groups')) {
        groups.add(`${params[0]}:${params[1]}`);
        return { rows: [] };
      }
      if (text.startsWith('SELECT body')) {
        const body = state.get(params[0]);
        return { rows: body ? [{ body }] : [] };
      }
      if (text.startsWith('INSERT INTO client_state')) {
        state.set(params[0], JSON.parse(params[1]));
        return { rows: [] };
      }
      if (text.startsWith('INSERT INTO client_log')) {
        log.push({ user: params[0], kind: params[1], body: params[2] });
        return { rows: [] };
      }
      if (text.startsWith('SELECT 1 FROM seen_comments')) {
        return { rows: comments.has(params[0]) ? [1] : [] };
      }
      if (text.startsWith('INSERT INTO seen_comments')) {
        comments.add(params[0]);
        return { rows: [] };
      }
      throw new Error(text);
    },
    async end() {}
  };
}

test('карточка клиента создаётся один раз и помнит рецепт', async () => {
  const pool = memoryPool();
  const db = createClients('postgres://localhost/kitchen', { pool });
  assert.equal(await db.init(), 0);
  const first = await db.ensureClient('42', null, '243405772');
  assert.equal(first.isNew, true);
  assert.equal(first.blocked, false);
  const named = await db.ensureClient('42', { name: 'Анна Ивова', username: 'anna', photo: 'https://vk.ru/a.jpg' }, '243405772', { count: false });
  assert.equal(named.isNew, false);
  assert.equal(named.name, 'Анна Ивова');
  assert.equal(pool.clients.get('42').messages, 1);
  assert.equal(pool.clients.get('42').username, 'anna');
  assert.ok(pool.groups.has('42:243405772'));

  const user = blankUser('42');
  user.favorites.push({ id: 'f1', title: 'Борщ', recipe: { title: 'Борщ' } });
  await db.saveUser(user);
  const loaded = await db.getUser('42');
  loaded.favorites[0].title = 'Суп';
  assert.equal((await db.getUser('42')).favorites[0].title, 'Борщ');

  await db.note('42', 'recipe', 'Борщ');
  assert.equal(pool.clients.get('42').recipes, 1);
  assert.equal(pool.log[0].kind, 'recipe');
  assert.equal(await db.hasComment('1:9'), false);
  await db.markComment('1:9');
  assert.equal(await db.hasComment('1:9'), true);

  pool.clients.get('42').blocked = true;
  assert.equal((await db.ensureClient('42', null, '243405772')).blocked, true);
  assert.equal(poolConfig('postgres://db.railway.internal:5432/railway').ssl, false);
  assert.equal(poolConfig('postgres://localhost/kitchen').ssl, false);
  assert.deepEqual(poolConfig('postgres://example.proxy.rlwy.net:1234/railway').ssl, { rejectUnauthorized: false });
});
