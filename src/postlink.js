'use strict';

function groupNumber(groupId) {
  return String(groupId || '').replace(/\D/g, '');
}

function chatUrl(groupId) {
  const id = groupNumber(groupId);
  return id ? `https://vk.ru/write-${id}` : '';
}

function withChatLink(text, groupId) {
  const id = groupNumber(groupId);
  const link = chatUrl(id);
  const body = String(text || '').trim();
  if (!link || body.includes(`write-${id}`)) return body;
  const line = `Чат с ботом: ${link}`;
  return body ? `${body}\n\n${line}` : line;
}

function attachmentList(post) {
  const list = [];
  for (const item of (post && post.attachments) || []) {
    if (!item || !item.type) continue;
    const media = item[item.type] || {};
    if (media.owner_id == null || media.id == null) continue;
    const access = media.access_key ? `_${media.access_key}` : '';
    list.push(`${item.type}${media.owner_id}_${media.id}${access}`);
  }
  return list.join(',');
}

function readWallPost(update, groupId) {
  if (!update || update.type !== 'wall_post_new') return null;
  const post = update.object && update.object.id ? update.object : (update.object && update.object.post) || null;
  if (!post || !post.id) return null;
  const group = Number(groupNumber(groupId));
  const owner = Number(post.owner_id || 0);
  const from = Number(post.from_id || 0);
  if (!group || Math.abs(owner) !== group || from !== -group) return null;
  if (post.post_type && post.post_type !== 'post') return null;
  return {
    id: Number(post.id),
    text: String(post.text || ''),
    attachments: attachmentList(post)
  };
}

module.exports = { chatUrl, withChatLink, attachmentList, readWallPost };
