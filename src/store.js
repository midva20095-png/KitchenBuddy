'use strict';

const fs = require('fs/promises');
const path = require('path');

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
      memory = parsed && typeof parsed === 'object' ? parsed : { users: {}, comments: [] };
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Хранилище повреждено, начинаю заново.');
      memory = { users: {}, comments: [] };
    }
    if (!memory.users || typeof memory.users !== 'object') memory.users = {};
    if (!Array.isArray(memory.comments)) memory.comments = [];
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
    }
  };
}

module.exports = { createStore };
