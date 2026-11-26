'use strict';

const { Pool } = require('pg');
const { matchCatalog } = require('./catalog');
const { familyIds } = require('./menu');
const { groupLibrary } = require('./store');

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
  )`,
  `CREATE TABLE IF NOT EXISTS catalog_recipes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    query TEXT NOT NULL DEFAULT '',
    recipe JSONB,
    body TEXT,
    source TEXT NOT NULL DEFAULT 'found',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS catalog_user_idx ON catalog_recipes (user_id, id DESC)`,
  `ALTER TABLE clients ADD COLUMN IF NOT EXISTS member BOOLEAN`,
  `ALTER TABLE clients ADD COLUMN IF NOT EXISTS dm_closed BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE catalog_recipes ADD COLUMN IF NOT EXISTS photo BYTEA`,
  `ALTER TABLE catalog_recipes ADD COLUMN IF NOT EXISTS photo_type TEXT NOT NULL DEFAULT ''`,
  `CREATE TABLE IF NOT EXISTS bot_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS library_recipes (
    id BIGSERIAL PRIMARY KEY,
    section TEXT NOT NULL,
    title TEXT NOT NULL,
    recipe JSONB NOT NULL,
    user_id TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

  function catalogRow(row) {
    return {
      id: String(row.id),
      category: row.category || '',
      title: row.title || '',
      query: row.query || '',
      recipe: row.recipe && typeof row.recipe === 'object' ? row.recipe : null,
      body: row.body || '',
      source: row.source || 'found',
      hasPhoto: Boolean(row.has_photo)
    };
  }

  async function saveCatalog(userId, item) {
    const id = cleanId(userId);
    if (!id || !item) return null;
    const title = cleanText(item.title || 'Рецепт', 80);
    const category = cleanText(item.category || '', 40);
    const queryText = cleanText(item.query || title, 200);
    const body = String(item.body || '').slice(0, 4000);
    const source = item.source === 'own' ? 'own' : 'found';
    const recipe = item.recipe && typeof item.recipe === 'object' ? JSON.stringify(item.recipe) : null;
    const photo = item.photo && item.photo.bytes && item.photo.bytes.length ? Buffer.from(item.photo.bytes) : null;
    const photoType = photo ? String(item.photo.mime || 'image/jpeg').slice(0, 40) : '';
    const existing = await query(
      `SELECT id FROM catalog_recipes
       WHERE category = $1 AND lower(title) = lower($2)
       ORDER BY id DESC LIMIT 1`,
      [category, title]
    );
    if (existing.rows[0]) {
      if (photo) {
        await query(
          `UPDATE catalog_recipes SET query = $2, recipe = $3::jsonb, body = $4, source = $5, photo = $6, photo_type = $7 WHERE id = $1`,
          [existing.rows[0].id, queryText, recipe, body, source, photo, photoType]
        );
      } else {
        await query(
          `UPDATE catalog_recipes SET query = $2, recipe = $3::jsonb, body = $4, source = $5 WHERE id = $1`,
          [existing.rows[0].id, queryText, recipe, body, source]
        );
      }
      return { id: String(existing.rows[0].id) };
    }
    const inserted = await query(
      `INSERT INTO catalog_recipes (user_id, category, title, query, recipe, body, source, photo, photo_type)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
       RETURNING id`,
      [id, category, title, queryText, recipe, body, source, photo, photoType]
    );
    return { id: inserted.rows[0] ? String(inserted.rows[0].id) : '' };
  }

  async function findCatalog(userId, lookup) {
    const category = String((lookup && lookup.category) || '');
    const family = familyIds(category);
    const result = family.length
      ? await query(
        `SELECT id::text AS id, category, title, query, recipe, COALESCE(body, '') AS body, source,
                (photo IS NOT NULL AND octet_length(photo) > 0) AS has_photo
         FROM catalog_recipes WHERE category = ANY($1::text[]) ORDER BY id DESC LIMIT 500`,
        [family]
      )
      : await query(
        `SELECT id::text AS id, category, title, query, recipe, COALESCE(body, '') AS body, source,
                (photo IS NOT NULL AND octet_length(photo) > 0) AS has_photo
         FROM catalog_recipes ORDER BY id DESC LIMIT 500`
      );
    return matchCatalog(result.rows.map(catalogRow), lookup);
  }

  async function listCatalog() {
    const result = await query(
      `SELECT id::text AS id, category, title, query, source,
              (photo IS NOT NULL AND octet_length(photo) > 0) AS has_photo
       FROM catalog_recipes ORDER BY id DESC LIMIT 30`
    );
    return result.rows.map(row => ({
      id: row.id,
      category: row.category || '',
      title: row.title || '',
      query: row.query || '',
      source: row.source || 'found',
      hasPhoto: Boolean(row.has_photo)
    }));
  }

  async function catalogPhoto(id) {
    const key = String(id || '').replace(/\D/g, '');
    if (!key) return null;
    const result = await query(
      `SELECT photo, COALESCE(photo_type, '') AS photo_type FROM catalog_recipes WHERE id = $1`,
      [key]
    );
    const row = result.rows[0];
    if (!row || !row.photo) return null;
    const bytes = Buffer.isBuffer(row.photo) ? row.photo : Buffer.from(row.photo);
    if (!bytes.length) return null;
    return { mime: row.photo_type || 'image/jpeg', bytes };
  }

  async function getCatalog(id) {
    const key = String(id || '').replace(/\D/g, '');
    if (!key) return null;
    const result = await query(
      `SELECT id::text AS id, category, title, query, recipe, COALESCE(body, '') AS body, source,
              (photo IS NOT NULL AND octet_length(photo) > 0) AS has_photo
       FROM catalog_recipes WHERE id = $1`,
      [key]
    );
    return result.rows[0] ? catalogRow(result.rows[0]) : null;
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
        (SELECT COUNT(*)::int FROM clients WHERE member IS TRUE) AS members,
        (SELECT COUNT(*)::int FROM clients WHERE member IS FALSE) AS guests,
        (SELECT COUNT(*)::int FROM clients WHERE dm_closed) AS closed,
        (SELECT COUNT(*)::int FROM clients WHERE member IS TRUE AND NOT blocked AND NOT dm_closed) AS ready,
        (SELECT COALESCE(SUM(recipes), 0)::int FROM clients) AS recipes,
        (SELECT COUNT(*)::int FROM shared_recipes) AS shared
    `);
    const row = result.rows[0] || {};
    return {
      clients: row.clients || 0,
      activeDay: row.active_day || 0,
      newDay: row.new_day || 0,
      blocked: row.blocked || 0,
      members: row.members || 0,
      guests: row.guests || 0,
      closed: row.closed || 0,
      ready: row.ready || 0,
      recipes: row.recipes || 0,
      shared: row.shared || 0,
      engine: 'postgres'
    };
  }

  async function listClients(search) {
    const result = await query(
      `SELECT user_id::text AS user_id, COALESCE(name, '') AS name, COALESCE(username, '') AS username,
              blocked, member, dm_closed, messages, recipes, created_at, last_seen
       FROM clients
       WHERE user_id::text ILIKE $1 OR COALESCE(name, '') ILIKE $1 OR COALESCE(username, '') ILIKE $1
       ORDER BY last_seen DESC
       LIMIT 400`,
      [`%${String(search || '').trim()}%`]
    );
    return result.rows.map(row => ({
      userId: row.user_id,
      name: row.name,
      username: row.username,
      blocked: Boolean(row.blocked),
      dmClosed: Boolean(row.dm_closed),
      member: row.member === true ? true : row.member === false ? false : null,
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
              COALESCE(photo, '') AS photo, blocked, member, dm_closed, messages, recipes, created_at, last_seen
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
        dmClosed: Boolean(row.dm_closed),
        member: row.member === true ? true : row.member === false ? false : null,
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

  async function markVisit(userId, member) {
    const id = cleanId(userId);
    if (!id || (member !== true && member !== false)) return;
    await query(
      `INSERT INTO clients (user_id, member, messages)
       VALUES ($1, $2, 0)
       ON CONFLICT (user_id) DO UPDATE SET member = EXCLUDED.member, updated_at = NOW()`,
      [id, member]
    );
  }

  async function setBlocked(userId, blocked) {
    const id = cleanId(userId);
    if (!id) return false;
    const flag = Boolean(blocked);
    if (flag) {
      await query(
        `INSERT INTO clients (user_id, blocked, messages)
         VALUES ($1, true, 0)
         ON CONFLICT (user_id) DO UPDATE SET blocked = true, updated_at = NOW()`,
        [id]
      );
      return true;
    }
    await query(
      'UPDATE clients SET blocked = false, updated_at = NOW() WHERE user_id = $1',
      [id]
    );
    return false;
  }

  async function setDmClosed(userId, closed) {
    const id = cleanId(userId);
    if (!id) return false;
    const flag = Boolean(closed);
    if (flag) {
      await query(
        `INSERT INTO clients (user_id, dm_closed, messages)
         VALUES ($1, true, 0)
         ON CONFLICT (user_id) DO UPDATE SET dm_closed = true, updated_at = NOW()`,
        [id]
      );
      return true;
    }
    await query(
      'UPDATE clients SET dm_closed = false, updated_at = NOW() WHERE user_id = $1',
      [id]
    );
    return false;
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

  async function getSettings() {
    const result = await query(`SELECT value FROM bot_settings WHERE key = 'public'`);
    const value = result.rows[0] && result.rows[0].value;
    if (value && typeof value.publicSections === 'boolean') return { publicSections: value.publicSections };
    return { publicSections: true };
  }

  async function setSettings(patch) {
    const publicSections = Boolean(patch && patch.publicSections);
    await query(
      `INSERT INTO bot_settings (key, value) VALUES ('public', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify({ publicSections })]
    );
    return { publicSections };
  }

  async function publishLibrary(entry) {
    const section = cleanText(entry && entry.section, 24);
    const title = cleanText(entry && entry.title, 80);
    if (!section || !title || !entry || !entry.recipe) return null;
    const userId = cleanText(entry.userId, 20);
    const found = await query(
      `SELECT id FROM library_recipes WHERE lower(section) = lower($1) AND lower(title) = lower($2) LIMIT 1`,
      [section, title]
    );
    if (found.rows[0]) {
      await query(
        `UPDATE library_recipes
         SET section = $2, title = $3, recipe = $4::jsonb, user_id = $5, updated_at = NOW()
         WHERE id = $1`,
        [found.rows[0].id, section, title, JSON.stringify(entry.recipe), userId]
      );
    } else {
      await query(
        `INSERT INTO library_recipes (section, title, recipe, user_id) VALUES ($1, $2, $3::jsonb, $4)`,
        [section, title, JSON.stringify(entry.recipe), userId]
      );
    }
    return { section, title };
  }

  async function library() {
    const result = await query(
      `SELECT section, title, recipe FROM library_recipes ORDER BY updated_at DESC LIMIT 200`
    );
    return groupLibrary(result.rows.map(row => ({
      section: row.section,
      title: row.title,
      recipe: row.recipe
    })));
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
    saveCatalog,
    findCatalog,
    listCatalog,
    getCatalog,
    catalogPhoto,
    markShared,
    stats,
    listClients,
    markVisit,
    clientCard,
    setBlocked,
    setDmClosed,
    listShared,
    getSettings,
    setSettings,
    publishLibrary,
    library
  };
}

module.exports = { createClients, SCHEMA, poolConfig };
