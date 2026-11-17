// Base-form fallback (src/glosses/base-form.ts): an inflected word words2 has no row for is glossed by its dictionary
// form's words2 row. Internal: the base form is never added to the output. Significant endings (ない, ぬ, たい) inside such
// a token are split off and glossed themselves; existing glosses and deliberate groupings are never touched.
const assert = require('node:assert/strict');
const test = require('node:test');
const {annotate} = require('../dist');
const {applyJapaneseBaseFormGlosses} = require('../dist/glosses/base-form');
const gloss = async (text, word) => (await annotate(text)).find(t => t.text === word)?.gloss;

test('unglossed inflected words take their dictionary form\'s words2 gloss', async () => {
	assert.equal(await gloss('質問に答えてください', '答えて'), 'answer');
	assert.equal(await gloss('線で結んでください', '結んで'), 'tie');
	assert.equal(await gloss('道を渡って', '渡って'), 'cross');
	assert.equal(await gloss('電車に乗ったら', '乗ったら'), 'ride');
	assert.equal(await gloss('渡らなかった', '渡ら'), 'cross');
});

test('the base form stays internal: tokens keep only text, isWord, gloss and phoneticToken', async () => {
	for (const token of await annotate('質問に答えてください')) for (const key of Object.keys(token))
		assert.ok(['text', 'isWord', 'gloss', 'phoneticToken'].includes(key), key);
});

test('existing glosses and deliberate groupings are left alone', async () => {
	assert.equal(await gloss('書いてください', '書いて'), 'write');         // words2 row for the surface form
	assert.equal(await gloss('どうやって行きますか', 'どうやって'), 'how can'); // a words2 phrase, one unit
	assert.deepEqual((await annotate('行かない')).map(t => t.text), ['行か', 'ない']);
});

const lookup = rows => word => rows[word] ?? null;
const m = (surface_form, pos, basic_form, word_position) => ({surface_form, pos, basic_form, verbose: {word_position}});

test('a significant ending inside an unglossed token is split off and glossed', () => {
	const tokens = [{text: '行かなかった', isWord: 1, phoneticToken: [['行', 'い'], ['か'], ['な'], ['か'], ['っ'], ['た']]}];
	const morphemes = [m('行か', '動詞', '行く', 1), m('なかっ', '助動詞', 'ない', 3), m('た', '助動詞', 'た', 6)];
	const out = applyJapaneseBaseFormGlosses(tokens, '行かなかった', morphemes, lookup({'行く': 'go', 'なかった': "wasn't"}));
	assert.deepEqual(out.map(t => [t.text, t.gloss]), [['行か', 'go'], ['なかった', "wasn't"]]);
	assert.equal(out.flatMap(t => t.phoneticToken).map(p => p[1] ?? p[0]).join(''), 'いかなかった');
	assert.equal(tokens[0].gloss, undefined); // input not mutated
});

test('other endings stay part of the word; an already glossed token is never split', () => {
	const morphemes = [m('食べ', '動詞', '食べる', 1), m('たい', '助動詞', 'たい', 3)];
	const token = () => [{text: '食べたい', isWord: 1, phoneticToken: [['食', 'た'], ['べ'], ['た'], ['い']]}];
	const rows = lookup({'食べる': 'eat', 'たい': 'want'});
	const glossed = [{...token()[0], gloss: 'want to eat'}];
	assert.deepEqual(applyJapaneseBaseFormGlosses(glossed, '食べたい', morphemes, rows), glossed);
	const te = [{text: '答えて', isWord: 1, phoneticToken: [['答', 'こた'], ['え'], ['て']]}];
	const out = applyJapaneseBaseFormGlosses(te, '答えて', [m('答え', '動詞', '答える', 1), m('て', '助詞', 'て', 3)], lookup({'答える': 'answer'}));
	assert.deepEqual(out.map(t => [t.text, t.gloss]), [['答えて', 'answer']]);
});

test('no words2 row for the base form, or not a verb or adjective: no gloss is invented', () => {
	const noun = [{text: '路面', isWord: 1}];
	assert.deepEqual(applyJapaneseBaseFormGlosses(noun, '路面', [m('路面', '名詞', '路面', 1)], lookup({})), noun);
	const verb = [{text: '咥えて', isWord: 1}];
	assert.deepEqual(applyJapaneseBaseFormGlosses(verb, '咥えて', [m('咥え', '動詞', '咥える', 1), m('て', '助詞', 'て', 3)], lookup({})), verb);
});
