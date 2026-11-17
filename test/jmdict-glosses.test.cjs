// JMdict fallback (src/glosses/jmdict.ts): offline English glosses, in house style, for content words words2 has no
// row for. words2 rows, the base-form fallback, context rules and counter glosses still come first.
const assert = require('node:assert/strict');
const test = require('node:test');
const {annotate, japaneseJmdictGloss, japaneseJmdictKanaGloss} = require('../dist');
const gloss = async (text, word) => (await annotate(text)).find(t => t.text === word)?.gloss;
const style = () => import('../scripts/jmdict-gloss-style.mjs');

test('house style: no brackets, no "to" on verbs, no article, no trailing marks', async () => {
	const {houseGloss} = await style();
	assert.equal(houseGloss('(passenger) fare', ['n']), 'fare');
	assert.equal(houseGloss('departure (of a train, car, etc.)', ['n', 'vs']), 'departure');
	assert.equal(houseGloss('to answer', ['v1', 'vi']), 'answer');
	assert.equal(houseGloss('to the point', ['exp']), 'to the point'); // only verbs drop "to"
	assert.equal(houseGloss('a sample', ['n']), 'sample');
	assert.equal(houseGloss('Mr.', ['suf']), 'Mr.');
	assert.equal(houseGloss('indicates direct object of action', ['prt']), null);
	assert.equal(houseGloss('pseudo-', ['pref']), null);
});

test('house style: one current sense, one short gloss', async () => {
	const {entryGloss} = await style();
	const g = (text, extra = {}) => ({lang: 'eng', type: null, text, ...extra});
	const sense = (gloss, extra = {}) => ({partOfSpeech: ['n'], appliesToKanji: ['*'], appliesToKana: ['*'], misc: [], gloss, ...extra});
	const entry = {sense: [
		sense([g('lid')], {misc: ['arch']}),
		sense([g('used to emphasize a point')]),
		sense([g('motorized two-wheeled vehicle of very small engine size'), g('moped')]),
	]};
	assert.equal(entryGloss(entry, '原付', 'げんつき'), 'moped'); // archaic and explanation-only senses skipped
	const particle = {sense: [sense([g('indicates direct object', {type: 'explanation'})], {partOfSpeech: ['prt']})]};
	assert.equal(entryGloss(particle, null, 'を'), null);
});

test('words words2 lacks get a JMdict gloss', async () => {
	assert.equal(await gloss('路面電車の運賃はいくらですか。', '運賃'), 'fare');
	assert.equal(await gloss('路面が濡れています。', '路面'), 'road surface');
	assert.equal(await gloss('交番の角を右に曲がってください。', '交番'), 'police box');
	assert.equal(await gloss('市役所の前で待ちます。', '市役所'), 'municipal office');
});

test('kana words: one gloss, or several words\' glosses joined by a slash', async () => {
	assert.equal(await gloss('きっぷを買います。', 'きっぷ'), 'ticket');
	assert.equal(await gloss('エレベーターで行きます。', 'エレベーター'), 'elevator');
	assert.equal(japaneseJmdictKanaGloss('かど'), 'excessive / corner'); // 過度, 角
	assert.equal(japaneseJmdictKanaGloss('あめ'), 'candy / rain'); // 飴 (usually kana) first, then 雨
	assert.equal(japaneseJmdictKanaGloss('ため'), 'good'); // in the data, but a dependent noun: never applied
	assert.notEqual(await gloss('観光のために行きます。', 'ため'), 'good');
});

test('the entry is picked by reading', () => {
	assert.equal(japaneseJmdictGloss('角', 'かど'), 'corner');
	assert.equal(japaneseJmdictGloss('角', 'かく'), 'angle');
	assert.equal(japaneseJmdictGloss('角'), null); // readings disagree, and none given
	assert.equal(japaneseJmdictGloss('行く'), 'go'); // いく and ゆく agree
});

test('function words, numbers and proper nouns keep their house notation or stay unglossed', async () => {
	const tokens = await annotate('大橋駅から新町行きの電車は2番線を出ます。');
	const of = word => tokens.find(t => t.text === word)?.gloss;
	assert.equal(of('を'), '⤺');
	assert.equal(of('の'), "'s");
	assert.equal(of('は'), ':');
	assert.equal(of('新町'), null);
});

test('words2 rows, context rules and counter glosses still win', async () => {
	assert.equal(await gloss('駅で待ちます。', '駅'), 'train station'); // words2, not JMdict's "railway station"
	assert.equal(await gloss('カフェは角にあります', '角'), 'corner');
	assert.equal(await gloss('新町行きの電車', '行き'), 'bound for');
	assert.equal(await gloss('2番線に来ます', '番線'), 'platform');
});
