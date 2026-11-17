// Marks (src/treatments/marks.ts): 〇 and × in true/false and choice questions are words, まる circle and ばつ cross.
// Arithmetic and numerals keep their readings.
const assert = require('node:assert/strict');
const test = require('node:test');
const {annotate} = require('../dist');
const token = async (text, word) => (await annotate(text)).find(t => t.text === word);
const reading = t => t?.phoneticToken?.map(p => p[1] ?? p[0]).join('');

test('〇 and × as marks: まる circle, ばつ cross', async () => {
	for (const [text, mark, read, gloss] of [
		['〇か×を書いてください。', '〇', 'まる', 'circle'],
		['〇か×を書いてください。', '×', 'ばつ', 'cross'],
		['仲間はずれに×をつけてください。', '×', 'ばつ', 'cross'],
		['正しいものに○をつけてください。', '○', 'まる', 'circle'],
		['○×クイズ', '×', 'ばつ', 'cross'],
	]) {
		const t = await token(text, mark);
		assert.equal(t.isWord, 1, text);
		assert.equal(reading(t), read, text);
		assert.equal(t.gloss, gloss, text);
	}
});

test('つけて after a mark is still "mark"', async () => {
	assert.equal((await token('仲間はずれに×をつけてください。', 'つけて')).gloss, 'mark');
});

test('arithmetic and numerals are left alone', async () => {
	assert.equal(reading(await token('3×4=12', '×')), 'かける');
	assert.equal(reading(await token('2 × 3', '×')), 'かける');
	const zero = await token('二〇二六年', '〇');
	assert.notEqual(zero?.gloss, 'circle');
	assert.notEqual(reading(zero), 'まる');
});
