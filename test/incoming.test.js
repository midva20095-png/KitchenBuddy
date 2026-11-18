'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readUpdate, wallWorthy, isThanks } = require('../src/incoming');

test('из события берётся входящее сообщение человека', () => {
  const message = readUpdate({
    type: 'message_new',
    object: { message: { id: 7, from_id: 10, peer_id: 10, text: '  борщ на 6 ', out: 0 } }
  });
  assert.equal(message.userId, '10');
  assert.equal(message.place, 'dm');
  assert.equal(message.text, 'борщ на 6');
  assert.equal(message.messageId, 7);
  assert.equal(readUpdate({ type: 'message_new', object: { message: { from_id: 10, text: 'я', out: 1 } } }), null);
  const chat = readUpdate({
    type: 'message_new',
    object: {
      message: {
        id: 8,
        from_id: 10,
        peer_id: 2000000001,
        text: '[club55|Кухня] рецепт',
        out: 0,
        reply_message: { from_id: -55 },
        attachments: [{ type: 'photo' }]
      }
    }
  });
  assert.equal(chat.place, 'chat');
  assert.equal(chat.text, 'рецепт');
  assert.equal(chat.mentioned, true);
  assert.equal(chat.replyToBot, true);
  assert.equal(chat.photo, true);
  assert.equal(chat.payload, null);
  const button = readUpdate({
    type: 'message_new',
    object: { message: { from_id: 10, peer_id: 10, text: 'Меню', payload: '{"a":"menu"}', out: 0 } }
  });
  assert.deepEqual(button.payload, { a: 'menu' });
});

test('комментарий со стены сообщества отделяется от чужих и своих', () => {
  const comment = readUpdate({
    type: 'wall_reply_new',
    object: { comment: { from_id: 7, id: 4, post_id: 9, text: 'как сварить борщ?', owner_id: -55 } }
  }, 55);
  assert.equal(comment.place, 'wall');
  assert.equal(comment.userId, '7');
  assert.equal(comment.postId, 9);
  assert.equal(comment.commentId, 4);
  assert.equal(readUpdate({
    type: 'wall_reply_new',
    object: { from_id: -55, id: 5, post_id: 9, text: 'ответ', owner_id: -55 }
  }, 55), null);
  assert.equal(readUpdate({
    type: 'wall_reply_new',
    object: { from_id: 7, id: 6, post_id: 9, text: 'чужая стена', owner_id: -9 }
  }, 55), null);
  assert.equal(isThanks('Спасибо большое'), true);
  assert.equal(isThanks('спасибо, как заменить сахар?'), false);
  assert.equal(wallWorthy('как сварить борщ'), true);
  assert.equal(wallWorthy('Спасибо большое'), false);
  assert.equal(wallWorthy('привет'), false);
});
