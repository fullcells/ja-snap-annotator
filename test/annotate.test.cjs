const assert = require('node:assert/strict');
const test = require('node:test');
const { annotate, refreshJapaneseSBWordsSnapshot } = require('../dist');

test('annotates Japanese offline from the bundled snapshot', async () => {
	const tokens = await annotate('猫のひげは高い。');
	assert.equal(tokens.map(token => token.text).join(''), '猫のひげは高い。');
	assert.equal(tokens.find(token => token.text === '猫')?.gloss, 'cat');
	assert.equal(tokens.find(token => token.text === 'ひげ')?.gloss, 'whiskers');
	assert.equal(tokens.find(token => token.text === '高い')?.gloss, 'high');
	assert.equal(tokens.find(token => token.text === '。')?.gloss ?? null, null);
});

test('forced refresh sends the local snapshot version and requests server revalidation', async () => {
	const originalFetch = global.fetch;
	let requestedUrl;
	global.fetch = async (url) => {
		requestedUrl = new URL(url);
		return { status: 304 };
	};

	try {
		const result = await refreshJapaneseSBWordsSnapshot({
			force: true,
			endpointUrl: 'https://example.test/api/japanese-sb-words',
		});
		assert.equal(requestedUrl.searchParams.get('version'), result.version);
		assert.equal(requestedUrl.searchParams.get('refresh'), '1');
		assert.equal(result.updated, false);
	} finally {
		global.fetch = originalFetch;
	}
});
