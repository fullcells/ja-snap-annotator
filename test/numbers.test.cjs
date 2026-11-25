// Numbers and counters (src/treatments/numbers.ts): readings by the number's last digit, dates, times, weekday
// abbreviations, comma-grouped numbers, and counting glosses.
const assert = require('node:assert/strict');
const test = require('node:test');
const {annotate, japaneseNumberReading, applyJapaneseNumberReadings} = require('../dist');
const reading = tokens => tokens.flatMap(t => t.phoneticToken ?? [[t.text]]).map(p => p[1] ?? p[0]).join('');
const read = async text => reading(await annotate(text, {latestSBWords: []}));
const gloss = async (text, word) => (await annotate(text)).find(t => t.text === word)?.gloss;

test('numbers read on their own', () => {
	const cases = {0: 'ゼロ', 4: 'よん', 19: 'じゅうきゅう', 130: 'ひゃくさんじゅう', 300: 'さんびゃく', 600: 'ろっぴゃく', 800: 'はっぴゃく',
		3000: 'さんぜん', 8000: 'はっせん', 2026: 'にせんにじゅうろく', 21300: 'にまんせんさんびゃく', 10000: 'いちまん', 100000000: 'いちおく'};
	for (const [n, want] of Object.entries(cases)) assert.equal(japaneseNumberReading(Number(n)), want, n);
});

test('分 follows the last digit: ぷん after 1, 3, 4, 6, 8 and tens; ふん after 2, 5, 7, 9; 何分 is なんぷん', async () => {
	const cases = {'1分': 'いっぷん', '2分': 'にふん', '3分': 'さんぷん', '4分': 'よんぷん', '5分': 'ごふん', '6分': 'ろっぷん', '7分': 'ななふん',
		'8分': 'はっぷん', '9分': 'きゅうふん', '10分': 'じゅっぷん', '13分': 'じゅうさんぷん', '19分': 'じゅうきゅうふん', '20分': 'にじゅっぷん',
		'34分': 'さんじゅうよんぷん', '41分': 'よんじゅういっぷん', '300分': 'さんびゃっぷん', '何分': 'なんぷん', '何分ぐらいですか': 'なんぷんぐらいですか'};
	for (const [text, want] of Object.entries(cases)) assert.equal(await read(text), want, text);
	assert.equal(await read('8時7分の電車'), 'はちじななふんのでんしゃ');
	assert.equal(await read('何分、'), 'なにぶん、'); // "anyway" before a comma
});

test('other counters: h-row, k-row, people, things', async () => {
	const cases = {'1本': 'いっぽん', '3本': 'さんぼん', '6本': 'ろっぽん', '何本': 'なんぼん', '3匹': 'さんびき', '1杯': 'いっぱい', '3杯': 'さんばい',
		'1回': 'いっかい', '6回': 'ろっかい', '10回': 'じゅっかい', '3階': 'さんがい', '8歳': 'はっさい', '1冊': 'いっさつ', '1個': 'いっこ',
		'1人': 'ひとり', '2人': 'ふたり', '4人': 'よにん', '何人': 'なんにん', '3つ': 'みっつ', '1丁目': 'いっちょうめ'};
	for (const [text, want] of Object.entries(cases)) assert.equal(await read(text), want, text);
});

test('fractions read 分 as ぶん and keep the numerator and denominator in order', async () => {
	for (const [text, kana, gloss] of [['4分の1', 'よんぶんのいち', '1/4'], ['十二分の五', 'じゅうにぶんのご', '5/12']]) {
		const tokens = await annotate(text);
		assert.equal(reading(tokens), kana);
		assert.deepEqual(tokens.map(t => [t.text, t.gloss]), [[text, gloss]]);
	}
	assert.equal(await read('4分の休憩'), 'よんぷんのきゅうけい');
});

test('dates, times and days', async () => {
	const cases = {'4月': 'しがつ', '7月': 'しちがつ', '9月': 'くがつ', '04月01日': 'しがつついたち', '11月14日': 'じゅういちがつじゅうよっか',
		'2日': 'ふつか', '10日': 'とおか', '20日': 'はつか', '24日': 'にじゅうよっか', '17日': 'じゅうしちにち', '何日': 'なんにち', '1日': 'いちにち',
		'3日間': 'みっかかん', '1日間': 'いちにちかん', '4時': 'よじ', '7時': 'しちじ', '9時': 'くじ', '14時': 'じゅうよじ', '何時': 'なんじ',
		'4時間': 'よじかん', '4年': 'よねん', '4円': 'よえん', '1番線': 'いちばんせん'};
	for (const [text, want] of Object.entries(cases)) assert.equal(await read(text), want, text);
});

test('a date of birth: 01日生 is the 1st + born', async () => {
	assert.equal(await read('平成10年04月01日生'), 'へいせいじゅうねんしがつついたちうまれ');
	assert.equal(await gloss('平成10年04月01日生', '生'), 'born');
});

test('weekday abbreviations in a range, a list or after a date', async () => {
	assert.equal(await read('（月〜金）'), '（げつ〜きん）');
	assert.equal(await read('土・日'), 'ど・にち');
	assert.equal(await read('14日（金）'), 'じゅうよっか（きん）');
	assert.equal(await gloss('（月〜金）', '月'), 'Mon');
	// a month and the moon are not weekdays
	assert.equal(await read('4月〜5月'), 'しがつ〜ごがつ');
});

test('comma-grouped numbers are one number', async () => {
	const tokens = await annotate('21,300円');
	assert.deepEqual(tokens.map(t => t.text), ['21,300', '円']);
	assert.equal(reading(tokens), 'にまんせんさんびゃくえん');
	assert.equal(tokens[1].gloss, 'yen');
});

test('a counter after a number glosses its counting sense', async () => {
	assert.equal(await gloss('130円', '円'), 'yen');
	assert.equal(await gloss('11月', '月'), 'month');
	assert.equal(await gloss('靴下を1足買う', '足'), '(pairs)');
	assert.equal(await gloss('1番線', '番線'), 'platform');
	assert.equal(await gloss('一つ目', '目'), '-th');
	assert.equal(await gloss('大橋からいくつ目の駅ですか', '目'), '-th');
	assert.equal(await read('何時ですか'), 'なんじですか');
	assert.equal(await gloss('何時', '何時'), 'what time'); // one token on its own; 何 + 時 in a sentence
	// on their own they keep the snapshot's noun gloss
	assert.notEqual(await gloss('円', '円'), 'yen');
	assert.notEqual(await gloss('月がきれいです', '月'), 'month');
});

test('IDs and other zero-padded numbers without a counter stay as written; cached tokens are not mutated', () => {
	const source = [{text: '04', isWord: 1, phoneticToken: [['04', '04']]}, {text: '月', isWord: 1, phoneticToken: [['月', 'つき']]}];
	const before = structuredClone(source);
	assert.equal(reading(applyJapaneseNumberReadings(source)), 'しがつ');
	assert.deepEqual(source, before);
	const id = [{text: '000012345600', isWord: 1, phoneticToken: [['000012345600', '000012345600']]}];
	assert.deepEqual(applyJapaneseNumberReadings(id), id);
});

test('kanji numerals are one number; question counters are one word; 羽, 組, 度 count', async () => {
	const tokens = async text => (await annotate(text)).filter(t => t.isWord);
	const t1 = await tokens('二十四時間');
	assert.equal(t1[0].text, '二十四');
	assert.deepEqual(t1[0].phoneticToken, [['二十四', 'にじゅうよ']]); // read with its counter: にじゅうよじかん
	const t2 = await tokens('何回行きましたか');
	assert.equal(t2[0].text, '何回');
	assert.equal(t2[0].gloss, 'how many times');
	const t3 = await tokens('鳥が3羽います');
	assert.deepEqual(t3.slice(2, 4).map(t => [t.text, t.phoneticToken.map(p => p[1]).join(''), t.gloss]), [['3', 'さん', '3'], ['羽', 'わ', '(birds)']]);
	const t4 = await tokens('本を一冊買いました');
	assert.deepEqual(t4.slice(2, 4).map(t => t.phoneticToken.map(p => p[1]).join('')), ['いっ', 'さつ']);
	const t5 = await tokens('二人で行きます');
	assert.deepEqual(t5.slice(0, 2).map(t => t.phoneticToken.map(p => p[1]).join('')), ['ふた', 'り']);
	assert.equal((await tokens('五十三'))[0].gloss, '53'); // no words2 row: its value
});
