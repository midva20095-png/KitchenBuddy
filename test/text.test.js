'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { portions, moscowDay, clip, normalize } = require('../src/text');

test('порции склоняются, сутки считаются по Москве', () => {
  assert.equal(portions(1), '1 порция');
  assert.equal(portions(2), '2 порции');
  assert.equal(portions(5), '5 порций');
  assert.equal(portions(11), '11 порций');
  assert.equal(portions(21), '21 порция');
  assert.equal(moscowDay(new Date('2026-11-17T20:30:00Z')), '2026-11-17');
  assert.equal(moscowDay(new Date('2026-11-17T21:30:00Z')), '2026-11-18');
  assert.equal(clip('борщ', 10), 'борщ');
  assert.equal(clip('12345', 4), '123…');
  assert.equal(normalize('  Ёлка «Борщ»  '), 'елка борщ');
});
