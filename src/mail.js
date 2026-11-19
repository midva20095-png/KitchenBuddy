'use strict';

function messagesClosed(error) {
  const code = Number(error && error.code);
  return code === 901 || code === 902;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function broadcast(options) {
  const store = options && options.store;
  const send = options && options.send;
  const member = options && options.member;
  const pause = Number(options && options.pause) || 0;
  const text = String((options && options.text) || '').trim().slice(0, 2000);
  if (!text) {
    const error = new Error('empty');
    error.status = 400;
    throw error;
  }
  if (!store || !store.listClients || !send) {
    const error = new Error('offline');
    error.status = 503;
    throw error;
  }
  const rows = await store.listClients('');
  const result = { sent: 0, skipped: 0, thrown: 0, failed: 0 };
  for (const row of rows || []) {
    const id = String(row.userId || '').replace(/\D/g, '');
    if (!id || row.blocked || row.dmClosed) {
      result.skipped += 1;
      continue;
    }
    let allowed = row.member === true;
    if (member) {
      try {
        allowed = Boolean(await member(id));
        if (store.markVisit) await store.markVisit(id, allowed);
      } catch (error) {
        allowed = false;
      }
    }
    if (!allowed) {
      result.skipped += 1;
      continue;
    }
    try {
      await send(id, text);
      result.sent += 1;
    } catch (error) {
      if (messagesClosed(error) && store.setDmClosed) {
        try { await store.setDmClosed(id, true); } catch (err) {}
        result.thrown += 1;
      } else {
        result.failed += 1;
      }
    }
    if (pause) await sleep(pause);
  }
  return result;
}

module.exports = { broadcast, messagesClosed };
