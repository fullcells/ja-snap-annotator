// Dictionary-guided merging (src/treatments/dictionary-merges.ts): adjacent tokens are joined when the joined text is a
// words2 row or a JMdict noun, within part-of-speech limits; numbers belong to the numbers treatment.
const assert = require('node:assert/strict');
const test = require('node:test');
const {annotate} = require('../dist');
const texts = async text => (await annotate(text)).map(t => t.text);
const token = async (text, word) => (await annotate(text)).find(t => t.text === word);

test('compounds Kuromoji splits are one word, with a whole-word gloss and reading', async () => {
	assert.deepEqual(await texts('路面電車の運賃'), ['路面電車', 'の', '運賃']);
	assert.equal((await token('パン屋の前', 'パン屋'))?.gloss, 'bakery');
	assert.equal((await token('時刻表を見て', '時刻表'))?.gloss, 'timetable');
	assert.equal((await token('運転免許証', '運転免許証'))?.gloss, "driver's license");
	assert.deepEqual((await token('タクシー乗り場', 'タクシー乗り場'))?.phoneticToken?.map(p => p[1] ?? p[0]).join(''), 'たくしーのりば');
});

test('kana words Kuromoji breaks are joined back', async () => {
	assert.equal((await token('バスのりば', 'のりば'))?.gloss, 'place for boarding vehicles'); // not のり seaweed + ば
	assert.ok((await texts('みらい鉄道')).includes('みらい'));
	assert.ok((await texts('きっぷうりば')).includes('うりば'));
});

test('verb and auxiliary chains words2 knows are joined without a list entry', async () => {
	assert.ok((await texts('本があります')).includes('あります'));
	assert.ok((await texts('学生でした')).includes('でした'));
	assert.ok((await texts('駅はどこですか')).includes('ですか')); // か tagged 副助詞／並立助詞／終助詞
});

test('never across clause particles, numbers or counters; には is one token (its words2 row)', async () => {
	assert.deepEqual(await texts('駅には'), ['駅', 'には']);
	assert.ok((await texts('勉強すると')).includes('と')); // と joins clauses: not すると "then"
	assert.ok((await texts('高いですが、')).includes('が')); // not ですが "but"
	assert.ok((await texts('一つ目の信号')).includes('目')); // not 一つ目 "one-eyed": the numbers treatment owns it
	assert.ok((await texts('18歳未満')).includes('歳')); // the counter stays with its number
});

test('words2 phrases and names are units without a list entry; re-splits still follow', async () => {
	assert.ok((await texts('背が高い人')).includes('背が高い')); // a particle inside a words2 row
	assert.ok((await texts('毎朝歯を磨く')).includes('歯を磨く'));
	assert.ok((await texts('どうやって行きますか')).includes('どうやって')); // adverb phrases
	assert.ok((await texts('ハリー・ポッター')).includes('ハリー・ポッター')); // ・ inside a words2 name
	assert.deepEqual((await texts('何でできていますか')).slice(0, 2), ['何', 'でできて']); // row 何でできて, re-split
});

test('a particle at either end of a words2 row is not trusted (私は, 前に), and いる + か is not いるか (dolphin)', async () => {
	assert.deepEqual(await texts('私は学生です'), ['私', 'は', '学生', 'です']);
	assert.ok((await texts('駅の前に')).includes('前'));
	assert.ok((await texts('そこにいるか')).includes('か'));
	assert.deepEqual(await texts('ふね'), ['ふね']); // ふ + ね: a one-kana "verb" before ね is a broken word
});
