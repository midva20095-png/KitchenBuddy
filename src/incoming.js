'use strict';

const { normalize } = require('./text');

const PRAISE = new Set([
  'спасибо', 'благодарю', 'благодарность', 'спс', 'класс', 'классно', 'супер', 'огонь',
  'круто', 'отлично', 'хорошо', 'ок', 'окей', 'большое', 'огромное', 'тебе', 'вам', 'за'
]);

function parsePayload(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function stripMention(text) {
  return String(text || '')
    .replace(/\[(?:club|public|id)\d+\|[^\]]+\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readMessage(update) {
  if (!update || update.type !== 'message_new') return null;
  const message = update.object && (update.object.message || update.object);
  if (!message || message.out) return null;
  const fromId = Number(message.from_id);
  const peerId = Number(message.peer_id || fromId);
  if (!Number.isInteger(fromId) || fromId <= 0 || !Number.isInteger(peerId) || peerId <= 0) return null;
  const original = String(message.text || '').trim();
  const replyFrom = message.reply_message && Number(message.reply_message.from_id);
  const photos = Array.isArray(message.attachments) && message.attachments.some(item => item && item.type === 'photo');
  return {
    userId: String(fromId),
    peerId,
    text: stripMention(original),
    payload: parsePayload(message.payload),
    place: peerId >= 2000000000 ? 'chat' : 'dm',
    photo: Boolean(photos),
    mentioned: /\[(?:club|public)\d+\|[^\]]+\]/i.test(original),
    replyToBot: Number.isInteger(replyFrom) && replyFrom < 0,
    messageId: Number(message.id) || 0,
    postId: 0,
    commentId: 0,
    replyTo: 0
  };
}

function readComment(update, groupId) {
  if (!update || update.type !== 'wall_reply_new') return null;
  const obj = update.object || {};
  const comment = obj.comment && typeof obj.comment === 'object' ? obj.comment : obj;
  const fromId = Number(comment.from_id || obj.from_id || 0);
  if (!Number.isInteger(fromId) || fromId <= 0) return null;
  const group = Number(String(groupId || '').replace(/\D/g, ''));
  const owner = Number(comment.post_owner_id || obj.post_owner_id || comment.owner_id || obj.owner_id || 0);
  if (group && owner && Math.abs(owner) !== group) return null;
  const postId = Number(comment.post_id || obj.post_id || (comment.post && comment.post.id) || 0);
  const commentId = Number(comment.id || obj.id || 0);
  if (!postId || !commentId) return null;
  const text = String(comment.text || obj.text || '').trim();
  if (!text) return null;
  const replyTo = Number(comment.reply_to_comment || obj.reply_to_comment || 0);
  return {
    userId: String(fromId),
    peerId: 0,
    text,
    payload: null,
    place: 'wall',
    photo: false,
    mentioned: false,
    replyToBot: false,
    messageId: 0,
    postId,
    commentId,
    replyTo: Number.isInteger(replyTo) && replyTo > 0 ? replyTo : 0
  };
}

function readUpdate(update, groupId) {
  return readMessage(update) || readComment(update, groupId);
}

function isThanks(text) {
  const value = normalize(text);
  if (!value || value.includes('?')) return false;
  if (/рецепт|замен|как|сколько|можно/.test(value)) return false;
  const parts = value.split(' ').filter(Boolean);
  return parts.length > 0 && parts.length <= 6 && parts.every(word => PRAISE.has(word));
}

function wallWorthy(text) {
  const value = normalize(text);
  if (!value || value.length < 4 || isThanks(value)) return false;
  return /рецепт|приготов|свар|испе|пожар|сделать|ингредиент|тесто|суп|салат|ужин|завтрак|десерт|замен|блюдо|выпеч|кухн|продукт|олад|борщ|каша|блин/.test(value);
}

module.exports = { readUpdate, readMessage, readComment, wallWorthy, isThanks, stripMention };
