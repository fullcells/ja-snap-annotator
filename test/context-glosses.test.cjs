// Context senses (src/glosses/treatments.ts): common words whose words2 row gives a sense that is wrong where learners
// meet them. Each rule fires only in its context; elsewhere the row's gloss stays (TODO.md lists the rows to fix).
const assert = require('node:assert/strict');
const test = require('node:test');
const {annotate} = require('../dist');
const token = async (text, word) => (await annotate(text)).find(t => t.text === word);
const gloss = async (text, word) => (await token(text, word))?.gloss;

test('〇をつけて: mark, not attach', async () => {
	assert.equal(await gloss('正しいほうに〇をつけてください。', 'つけて'), 'mark');
	assert.equal(await gloss('×をつけてください', 'つけて'), 'mark');
	assert.notEqual(await gloss('帽子をつけてください', 'つけて'), 'mark');
});

test('ほう: (the) one in a choice or comparison, direction after の', async () => {
	assert.equal(await gloss('正しいほうに〇をつけてください。', 'ほう'), '(the) one');
	assert.equal(await gloss('急行のほうが速いです', 'ほう'), '(the) one');
	assert.equal(await gloss('出口のほうです', 'ほう'), 'direction');
});

test('曲がる in directions: turn', async () => {
	assert.equal(await gloss('右に曲がってください', '曲がって'), 'turn');
	assert.equal(await gloss('角を左に曲がります', '曲がり'), 'turn');
	assert.notEqual(await gloss('曲がった釘', '曲がった'), 'turn');
});

test('角 on its own is かど, a corner; compounds keep their reading', async () => {
	const t = await token('カフェは角にあります', '角');
	assert.equal(t.gloss, 'corner');
	assert.deepEqual(t.phoneticToken, [['角', 'かど']]);
	assert.equal((await token('角', '角')).phoneticToken[0][1], 'かど');
	assert.equal((await token('三角', '三角')).phoneticToken.map(p => p[1]).join(''), 'さんかく');
});

test('普通: local (train) in a transit context, standard (licence) before 免許, the row elsewhere', async () => {
	assert.equal(await gloss('普通だけ止まる駅', '普通'), 'local (train)');
	assert.equal(await gloss('8時7分の普通', '普通'), 'local (train)');
	assert.equal(await gloss('普通免許', '普通'), 'standard (licence)');
	assert.ok(!['local (train)', 'standard (licence)'].includes(await gloss('普通は高い', '普通')));
});

test('行き after a place: bound for; 行きます stays the verb', async () => {
	assert.equal(await gloss('新町行きの電車', '行き'), 'bound for');
	assert.equal(await gloss('どこ行きですか', '行き'), 'bound for');
	for (const text of ['空港に行きます', 'どうやって行きますか', '行きたいです'])
		assert.notEqual(await gloss(text, '行き'), 'bound for', text);
});
