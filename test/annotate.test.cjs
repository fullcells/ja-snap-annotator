const assert = require('node:assert/strict');
const test = require('node:test');
const { annotate } = require('../dist');

test('annotates Japanese offline from the bundled snapshot', async () => {
	const tokens = await annotate('猫のひげは高い。');
	assert.equal(tokens.map(token => token.text).join(''), '猫のひげは高い。');
	assert.equal(tokens.find(token => token.text === '猫')?.gloss, 'cat');
	assert.equal(tokens.find(token => token.text === 'ひげ')?.gloss, 'whiskers');
	assert.equal(tokens.find(token => token.text === '高い')?.gloss, 'high');
	assert.equal(tokens.find(token => token.text === '。')?.gloss ?? null, null);
});
