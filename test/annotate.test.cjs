const assert = require('node:assert/strict');
const test = require('node:test');
const {
	annotate,
	applyJapaneseGlossTreatments,
	refreshJapaneseSBWordsSnapshot,
} = require('../dist');

test('annotates Japanese offline from the bundled snapshot', async () => {
	const tokens = await annotate('猫のひげは高い。');
	assert.equal(tokens.map(token => token.text).join(''), '猫のひげは高い。');
	assert.equal(tokens.find(token => token.text === '猫')?.gloss, 'cat');
	assert.equal(tokens.find(token => token.text === 'ひげ')?.gloss, 'whiskers');
	assert.equal(tokens.find(token => token.text === '高い')?.gloss, 'high');
	assert.equal(tokens.find(token => token.text === '。')?.gloss ?? null, null);
});

test('prefers caller-supplied current words2 rows over the bundled snapshot', async () => {
	const latestSBWords = [{
		id: 1,
		word_lang: 'ja',
		word: '猫',
		gloss: 'current cat gloss',
		gloss_lang: 'en',
		is_core: true,
		created_at: '2026-09-22T00:00:00.000Z',
		is_human_verified: true,
	}];
	const tokens = await annotate('猫', { latestSBWords });
	assert.equal(tokens.length, 1);
	assert.equal(tokens[0].gloss, 'current cat gloss');
});

test('applies Japanese token grouping and contextual gloss treatments', async () => {
	const capital = await annotate('王都', { latestSBWords: [] });
	assert.deepEqual(capital.map(token => token.text), ['王都']);

	const caution = await annotate('気をつけて', { latestSBWords: [] });
	assert.deepEqual(caution.map(token => token.text), ['気をつけて']);

	const annotatedTry = await annotate('言ってみ', { latestSBWords: [] });
	assert.equal(annotatedTry.find(token => token.text === 'み')?.gloss, 'try');

	const teFormTry = applyJapaneseGlossTreatments([
		{ text: 'て', isWord: 1, gloss: '-te' },
		{ text: 'み', isWord: 1, gloss: 'see' },
	]);
	assert.equal(teFormTry[1].gloss, 'try');

	const unrelatedMi = applyJapaneseGlossTreatments([
		{ text: '鏡', isWord: 1, gloss: 'mirror' },
		{ text: 'み', isWord: 1, gloss: 'see' },
	]);
	assert.equal(unrelatedMi[1].gloss, 'see');
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
