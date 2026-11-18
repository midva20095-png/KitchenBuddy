'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { withChatLink, readWallPost } = require('../src/postlink');

test('ссылка на чат дописывается один раз и не трогает чужие посты', () => {
  const once = withChatLink('Рецепт борща.', '243405772');
  assert.match(once, /Рецепт борща/);
  assert.match(once, /Чат с ботом: https:\/\/vk\.ru\/write-243405772/);
  assert.equal(withChatLink(once, '243405772'), once);

  const own = readWallPost({
    type: 'wall_post_new',
    object: {
      id: 9,
      owner_id: -243405772,
      from_id: -243405772,
      text: 'Новый рецепт',
      attachments: [{ type: 'photo', photo: { owner_id: -243405772, id: 4 } }]
    }
  }, '243405772');
  assert.equal(own.id, 9);
  assert.equal(own.attachments, 'photo-243405772_4');

  assert.equal(readWallPost({
    type: 'wall_post_new',
    object: { id: 3, owner_id: -243405772, from_id: 15, text: 'от человека' }
  }, '243405772'), null);
  assert.equal(readWallPost({
    type: 'wall_post_new',
    object: { id: 4, owner_id: -213938339, from_id: -213938339, text: 'Баба Яга' }
  }, '243405772'), null);
});
