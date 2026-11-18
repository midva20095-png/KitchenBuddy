'use strict';

const { Pool } = require('pg');

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS clients (
    user_id BIGINT PRIMARY KEY,
    name TEXT,
    username TEXT,
    photo TEXT,
    blocked BOOLEAN NOT NULL DEFAULT false,
    messages INTEGER NOT NULL DEFAULT 0,
    recipes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS client_groups (
    user_id BIGINT NOT NULL,
    group_id BIGINT NOT NULL,
    seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, group_id)
  )`,
  `CREATE TABLE IF NOT EXISTS client_state (
    user_id BIGINT PRIMARY KEY,
    body JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS client_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    kind TEXT NOT NULL,
    body TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS client_log_user_idx ON client_log (user_id, id DESC)`,
  `CREATE TABLE IF NOT EXISTS seen_comments (
    key TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS shared_recipes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'own',
    status TEXT NOT NULL DEFAULT 'saved',
    post_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
];

function poolConfig(connectionString) {
  const local = /localhost|127\.0\.0\.1|\.internal/i.test(connectionString);
  return {
    connectionString,
    ssl: local ? false : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 8000
  };
}

function cleanId(value) {
  const id = String(value || '').replace(/\D/g, '');
  return id ? id : '';
}

function cleanText(value, limit) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.slice(0, limit);
}

function createClients(connectionString, options) {
  const pool = (options && options.pool) || new Pool(poolConfig(connectionString));

  async function query(sql, params) {
    return pool.query(sql, params);
  }

  async function init() {
    for (const sql of SCHEMA) await query(sql);
    const count = await query('SELECT COUNT(*)::int AS n FROM clients');
    return Number(count.rows[0] && count.rows[0].n) || 0;
  }

  async function ensureClient(userId, profile, groupId, extra) {
    const id = cleanId(userId);
    if (!id) return { isNew: false, blocked: false, name: '' };
    const face = profile || {};
    const name = cleanText(face.name, 80);
    const username = cleanText(face.username, 64);
    const photo = cleanText(face.photo, 300);
    const count = extra && extra.count === false ? 0 : 1;
    const inserted = await query(
      `INSERT INTO clients (user_id, name, username, photo, messages)
       VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), NULLIF($4, ''), $5)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING user_id`,
      [id, name, username, photo, count]
    );
    if (!inserted.rows[0]) {
      await query(
        `UPDATE clients SET
           messages = messages + $5,
           last_seen = NOW(),
           updated_at = NOW(),
           name = COALESCE(NULLIF($2, ''), name),
           username = COALESCE(NULLIF($3, ''), username),
           photo = COALESCE(NULLIF($4, ''), photo)
         WHERE user_id = $1`,
        [id, name, username, photo, count]
      );
    }
    const group = cleanId(groupId);
    if (group) {
      await query(
        `INSERT INTO client_groups (user_id, group_id, seen_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id, group_id) DO UPDATE SET seen_at = NOW()`,
        [id, group]
      );
    }
    const card = await query('SELECT name, blocked FROM clients WHERE user_id = $1', [id]);
    const row = card.rows[0] || {};
    return { isNew: Boolean(inserted.rows[0]), blocked: Boolean(row.blocked), name: row.name || '' };
  }

  async function getUser(userId) {
    const id = cleanId(userId);
    if (!id) return null;
    const result = await query('SELECT body FROM client_state WHERE user_id = $1', [id]);
    const body = result.rows[0] && result.rows[0].body;
    if (!body || typeof body !== 'object') return null;
    return structuredClone(body);
  }

  async function saveUser(user) {
    const id = cleanId(user && user.id);
    if (!id) return;
    await query(
      `INSERT INTO client_state (user_id, body, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET body = EXCLUDED.body, updated_at = NOW()`,
      [id, JSON.stringify(user)]
    );
  }

  async function note(userId, kind, body) {
    const id = cleanId(userId);
    const name = cleanText(kind, 40);
    if (!id || !name) return;
    await query(
      'INSERT INTO client_log (user_id, kind, body) VALUES ($1, $2, NULLIF($3, \'\'))',
      [id, name, cleanText(body, 300)]
    );
    if (name === 'recipe') {
      await query('UPDATE clients SET recipes = recipes + 1, updated_at = NOW() WHERE user_id = $1', [id]);
    }
  }

  async function hasComment(key) {
    const value = String(key || '');
    if (!value) return false;
    const result = await query('SELECT 1 FROM seen_comments WHERE key = $1', [value]);
    return result.rows.length > 0;
  }

  async function markComment(key) {
    const value = String(key || '');
    if (!value) return;
    await query(
      'INSERT INTO seen_comments (key) VALUES ($1) ON CONFLICT (key) DO NOTHING',
      [value]
    );
  }

  async function saveShared(userId, share) {
    const id = cleanId(userId);
    const result = await query(
      `INSERT INTO shared_recipes (user_id, title, body, source)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        id || '0',
        cleanText((share && share.title) || 'Рецепт', 80),
        String((share && share.body) || '').slice(0, 4000),
        (share && share.source) === 'bot' ? 'bot' : 'own'
      ]
    );
    return { id: result.rows[0] ? String(result.rows[0].id) : '' };
  }

  async function markShared(id, postId) {
    const key = cleanId(id);
    if (!key) return;
    await query(
      `UPDATE shared_recipes SET status = 'posted', post_id = NULLIF($2, '')::bigint WHERE id = $1`,
      [key, cleanId(postId)]
    );
  }

  async function stats() {
    const result = await query(`
      SELECT
        (SELECT COUNT(*)::int FROM clients) AS clients,
        (SELECT COUNT(*)::int FROM clients WHERE last_seen >= NOW() - INTERVAL '1 day') AS active_day,
        (SELECT COUNT(*)::int FROM clients WHERE created_at >= NOW() - INTERVAL '1 day') AS new_day,
        (SELECT COUNT(*)::int FROM clients WHERE blocked) AS blocked,
        (SELECT COALESCE(SUM(recipes), 0)::int FROM clients) AS recipes,
        (SELECT COUNT(*)::int FROM shared_recipes) AS shared
    `);
    const row = result.rows[0] || {};
    return {
      clients: row.clients || 0,
      activeDay: row.active_day || 0,
      newDay: row.new_day || 0,
      blocked: row.blocked || 0,
      recipes: row.recipes || 0,
      shared: row.shared || 0,
      engine: 'postgres'
    };
  }

  async function listClients(search) {
    const result = await query(
      `SELECT user_id::text AS user_id, COALESCE(name, '') AS name, COALESCE(username, '') AS username,
              blocked, messages, recipes, created_at, last_seen
       FROM clients
       WHERE user_id::text ILIKE $1 OR COALESCE(name, '') ILIKE $1 OR COALESCE(username, '') ILIKE $1
       ORDER BY last_seen DESC
       LIMIT 100`,
      [`%${String(search || '').trim()}%`]
    );
    return result.rows.map(row => ({
      userId: row.user_id,
      name: row.name,
      username: row.username,
      blocked: Boolean(row.blocked),
      messages: row.messages,
      recipes: row.recipes,
      createdAt: row.created_at,
      lastSeen: row.last_seen
    }));
  }

  async function clientCard(userId) {
    const id = cleanId(userId);
    if (!id) return null;
    const card = await query(
      `SELECT user_id::text AS user_id, COALESCE(name, '') AS name, COALESCE(username, '') AS username,
              COALESCE(photo, '') AS photo, blocked, messages, recipes, created_at, last_seen
       FROM clients WHERE user_id = $1`,
      [id]
    );
    if (!card.rows[0]) return null;
    const groups = await query(
      'SELECT group_id::text AS group_id FROM client_groups WHERE user_id = $1 ORDER BY seen_at DESC',
      [id]
    );
    const log = await query(
      `SELECT kind, COALESCE(body, '') AS body, created_at FROM client_log
       WHERE user_id = $1 ORDER BY id DESC LIMIT 40`,
      [id]
    );
    const state = await query('SELECT body FROM client_state WHERE user_id = $1', [id]);
    const body = state.rows[0] && state.rows[0].body;
    const favorites = body && Array.isArray(body.favorites) ? body.favorites.map(item => item.title).filter(Boolean) : [];
    const shared = await query(
      `SELECT id::text AS id, title, source, status, COALESCE(post_id::text, '') AS post_id, created_at
       FROM shared_recipes WHERE user_id = $1 ORDER BY id DESC LIMIT 20`,
      [id]
    );
    const row = card.rows[0];
    return {
      user: {
        userId: row.user_id,
        name: row.name,
        username: row.username,
        photo: row.photo,
        blocked: Boolean(row.blocked),
        messages: row.messages,
        recipes: row.recipes,
        groupId: groups.rows.map(item => item.group_id).join(','),
        createdAt: row.created_at,
        lastSeen: row.last_seen
      },
      favorites,
      log: log.rows.map(item => ({ kind: item.kind, body: item.body, at: item.created_at })),
      shared: shared.rows.map(item => ({
        id: item.id,
        title: item.title,
        source: item.source,
        status: item.status,
        postId: item.post_id,
        createdAt: item.created_at
      }))
    };
  }

  async function setBlocked(userId, blocked) {
    const id = cleanId(userId);
    if (!id) return false;
    const result = await query(
      'UPDATE clients SET blocked = $2, updated_at = NOW() WHERE user_id = $1 RETURNING blocked',
      [id, Boolean(blocked)]
    );
    return Boolean(result.rows[0] && result.rows[0].blocked);
  }

  async function listShared() {
    const result = await query(
      `SELECT s.id::text AS id, s.user_id::text AS user_id, COALESCE(c.name, '') AS name,
              s.title, s.source, s.status, COALESCE(s.post_id::text, '') AS post_id, s.created_at
       FROM shared_recipes s
       LEFT JOIN clients c ON c.user_id = s.user_id
       ORDER BY s.id DESC
       LIMIT 50`
    );
    return result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      title: row.title,
      source: row.source,
      status: row.status,
      postId: row.post_id,
      createdAt: row.created_at
    }));
  }

  function close() {
    return pool.end();
  }

  return {
    init,
    close,
    query,
    getUser,
    saveUser,
    ensureClient,
    note,
    hasComment,
    markComment,
    saveShared,
    markShared,
    stats,
    listClients,
    clientCard,
    setBlocked,
    listShared
  };
}

module.exports = { createClients, SCHEMA, poolConfig };
