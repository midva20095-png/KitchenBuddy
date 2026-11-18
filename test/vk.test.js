'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createVk, connectHint, API } = require('../src/vk');

function paramsOf(body) {
  return Object.fromEntries(new URLSearchParams(body));
}

test('отказ ВК объясняется без ключа', () => {
  assert.match(connectHint({ code: 100, message: 'longpoll for this group is not enabled' }), /Long Poll API/);
  assert.match(connectHint({ code: 15, message: 'Access denied' }), /Управление/);
  assert.match(connectHint({ code: 27, message: 'Group authorization failed' }), /ключ сообщества/);
  assert.match(connectHint({ code: 5, message: 'invalid access_token vk1.a.secret' }), /Ключ сообщества/);
  assert.doesNotMatch(connectHint({ code: 5, message: 'invalid access_token vk1.a.secret' }), /vk1\.a\.secret/);
});

test('ключ уходит в метод, а клавиатура снимается, если сообщество её не приняло', async () => {
  const sent = [];
  const vk = createVk({
    token: 'secret-token',
    groupId: '55',
    axios: {
      post: async (url, body) => {
        const params = paramsOf(body);
        sent.push({ url, params });
        assert.equal(params.access_token, 'secret-token');
        assert.equal(params.v, '5.199');
        if (url === `${API}/messages.send` && params.keyboard && sent.filter(item => item.url.endsWith('/messages.send')).length === 1) {
          return { data: { error: { error_code: 912, error_msg: 'keyboard is not supported' } } };
        }
        if (url === `${API}/groups.getById`) return { data: { response: { groups: [{ id: 77, name: 'Кухня' }] } } };
        if (url === `${API}/groups.getLongPollServer`) return { data: { response: { server: 'https://lp.example/wh', key: 'k', ts: '4' } } };
        return { data: { response: 1 } };
      },
      get: async (url, options) => ({ data: { ts: '5', updates: [{ type: 'message_new' }] }, url, options })
    }
  });
  await vk.send(10, 'борщ secret-token', '{"buttons":[]}');
  const messages = sent.filter(item => item.url.endsWith('/messages.send'));
  assert.equal(messages.length, 2);
  assert.equal(messages[1].params.keyboard, undefined);
  assert.equal(messages[1].params.message, 'борщ secret-token');
  assert.notEqual(messages[0].params.random_id, messages[1].params.random_id);
  const found = await vk.resolveGroup();
  assert.deepEqual(found, { id: '77', name: 'Кухня' });
  const server = await vk.longPollServer();
  assert.equal(sent.find(item => item.url.endsWith('/groups.getLongPollServer')).params.group_id, '55');
  const packet = await vk.poll(server);
  assert.equal(packet.restart, false);
  assert.equal(packet.server.ts, '5');
  assert.equal(packet.updates.length, 1);
  const missed = await vk.poll({ server: 'https://lp.example/wh', key: 'k', ts: '5' });
  vk.axios.get = async () => ({ data: { failed: 1, ts: '9' } });
  const shifted = await vk.poll({ server: 'https://lp.example/wh', key: 'k', ts: '5' });
  assert.equal(shifted.restart, false);
  assert.equal(shifted.server.ts, '9');
  vk.axios.get = async () => ({ data: { failed: 2 } });
  assert.equal((await vk.poll(server)).restart, true);
  assert.equal(missed.updates[0].type, 'message_new');
  let settingsFailed = false;
  vk.axios.post = async (url, body) => {
    const params = paramsOf(body);
    sent.push({ url, params });
    if (url.endsWith('/groups.setSettings')) return { data: { error: { error_code: 15, error_msg: 'denied' } } };
    return { data: { response: 1 } };
  };
  await vk.enable();
  assert.ok(sent.some(item => item.url.endsWith('/groups.edit')));
  assert.ok(sent.some(item => item.url.endsWith('/groups.setLongPollSettings') && item.params.message_new === '1' && item.params.wall_post_new === '1'));
  assert.equal(settingsFailed, false);
  await vk.comment({ postId: 9, commentId: 4, replyTo: 4 }, 'Начните с бульона');
  const comment = sent.find(item => item.url.endsWith('/wall.createComment'));
  assert.equal(comment.params.owner_id, '-55');
  assert.equal(comment.params.from_group, '1');
  assert.equal(comment.params.reply_to_comment, '4');
  assert.equal(comment.params.guid, 'kb4');
  assert.doesNotMatch(comment.params.message, /secret-token/);
});

test('фото рецепта крепится к сообщению', async () => {
  const sent = [];
  const vk = createVk({
    token: 'secret-token',
    groupId: '55',
    axios: {
      post: async (url, body) => {
        if (typeof body !== 'string') {
          sent.push({ url, upload: true });
          if (String(url).includes('fail-upload')) throw new Error('upload');
          return { data: { server: '1', photo: '[]', hash: 'h' } };
        }
        const params = paramsOf(body);
        sent.push({ url, params });
        if (url.endsWith('/photos.getMessagesUploadServer')) {
          return { data: { response: { upload_url: sent.some(item => item.params && item.params.peer_id === '8') ? 'https://pu.vk.com/fail-upload' : 'https://pu.vk.com/c' } } };
        }
        if (url.endsWith('/photos.saveMessagesPhoto')) {
          return { data: { response: [{ owner_id: -55, id: 9 }] } };
        }
        return { data: { response: 1 } };
      }
    }
  });
  await vk.send(10, 'Борщ', '', { bytes: Buffer.from('jpeg-bytes-here'), mime: 'image/jpeg' });
  const message = sent.find(item => String(item.url).endsWith('/messages.send'));
  assert.equal(message.params.attachment, 'photo-55_9');
  assert.equal(message.params.message, 'Борщ');
  assert.doesNotMatch(message.params.message, /secret-token/);
  await vk.send(8, 'Без снимка', '', { bytes: Buffer.from('jpeg-bytes-here'), mime: 'image/jpeg' });
  const plain = sent.filter(item => String(item.url).endsWith('/messages.send')).at(-1);
  assert.equal(plain.params.attachment, undefined);
  assert.equal(plain.params.message, 'Без снимка');
});
