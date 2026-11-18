'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { matchCatalog, sameShelf, formatCatalog } = require('../src/catalog');

const borscht = { category: 'soup', title: 'Борщ', query: 'борщ', recipe: { title: 'Борщ' }, body: 'свекла' };
const honey = { category: 'cake', title: 'Медовик', query: 'медовик', recipe: { title: 'Медовик' }, body: 'коржи' };
const pasta = { category: 'pasta', title: 'Паста с курицей', query: 'паста с курицей', body: 'курица' };
const loose = { category: '', title: 'Сырники', query: 'сырники', body: 'творог' };

test('полка не отдаёт чужой рецепт', () => {
  assert.equal(sameShelf('soup', 'cake'), false);
  assert.equal(sameShelf('soup', 'borsch'), true);
  assert.equal(sameShelf('soup', 'first'), true);
  assert.equal(sameShelf('first', 'soup'), true);
  assert.equal(sameShelf('', 'soup'), false);

  assert.equal(matchCatalog([borscht, honey], { category: 'cake', dish: 'борщ' }), null);
  assert.equal(matchCatalog([borscht], { category: 'soup', dish: 'борщ' }).title, 'Борщ');
  assert.equal(matchCatalog([borscht], { category: 'first', dish: 'борщ' }).title, 'Борщ');
  assert.equal(matchCatalog([pasta], { category: 'pasta', dish: 'паста карбонара' }), null);
  assert.equal(matchCatalog([loose], { category: 'breakfast', dish: 'сырники' }), null);
  assert.equal(matchCatalog([loose], { category: '', dish: 'сырники' }).title, 'Сырники');
  assert.match(formatCatalog([borscht]), /Борщ/);
  assert.match(formatCatalog([]), /пусто/);
});
