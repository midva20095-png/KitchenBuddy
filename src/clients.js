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
    markComment
  };
}

module.exports = { createClients, SCHEMA, poolConfig };
