'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { createStore } = require('../src/store');
const { blankUser } = require('../src/dialog');

test('диалог пишется на диск и не портится чужой правкой', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kitchen-'));
  const store = createStore(dir);
  assert.equal(await store.getUser('1'), null);
  const user = blankUser('1');
  user.favorites.push({ id: 'f1', title: 'Борщ', recipe: { title: 'Борщ', steps: ['a'], ingredients: [] } });
  await store.saveUser(user);
  const loaded = await store.getUser('1');
  loaded.favorites[0].title = 'Суп';
  const again = await store.getUser('1');
  assert.equal(again.favorites[0].title, 'Борщ');
  assert.equal(await store.hasComment('k0'), false);
  for (let i = 0; i < 401; i += 1) await store.markComment(`k${i}`);
  assert.equal(await store.hasComment('k0'), false);
  assert.equal(await store.hasComment('k400'), true);
  await fs.writeFile(path.join(dir, 'kitchen.json'), '{{{');
  const fresh = createStore(dir);
  assert.equal(await fresh.getUser('1'), null);
  await fresh.saveUser(blankUser('2'));
  assert.equal((await fresh.getUser('2')).id, '2');
});
