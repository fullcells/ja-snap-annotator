const assert = require('node:assert/strict');
const test = require('node:test');
const { annotate, resolveJapaneseReadings, spellTokens } = require('../dist');
const coverage = require('../scripts/data/missing-reading-coverage.json');
const snapshot = require('../src/snapshot/japanese-sb-words.snapshot.json');
const reading = tokens => tokens.flatMap(t => t.phoneticToken ?? [[t.text]]).map(p => p[1] ?? p[0]).join('');

test('all 52 reported characters have contextual readings and offline words2 glosses', async () => {
  assert.equal(new Set(coverage.map(row => row.character)).size, 52);
  for (const row of coverage) {
    assert.ok(snapshot.rows.some(r => r.word_lang === 'ja' && r.gloss_lang === 'en'
      && r.word === row.character && r.gloss.trim()), row.character);
    const tokens = await annotate(row.example);
    assert.equal(tokens.map(t => t.text).join(''), row.example);
    assert.equal(reading(tokens), row.reading, row.example);
    for (const token of tokens) {
      if (token.phoneticToken) assert.equal(token.phoneticToken.map(p => p[0]).join(''), token.text);
      if (token.text === row.character) assert.ok(token.gloss?.trim(), row.character);
    }
  }
});

test('dictionary repairs inflections beyond the reviewed list', async () => {
  for (const [text, expected] of [
    ['咥えよう', 'くわえよう'], ['憑りついて', 'とりついて'],
    ['憑く', 'つく'], ['挫こう', 'くじこう'], ['嚙んだ', 'かんだ'],
    ['癒やされる', 'いやされる'], ['頑なだった', 'かたくなだった'],
  ]) assert.equal(reading(await annotate(text)), expected, text);
});

test('cached parts retain boundaries, glosses and protected readings', () => {
  const source = [
    { text: '咥', isWord: 1, gloss: 'hold in mouth', phoneticToken: [['咥']] },
    { text: 'えた', isWord: 1, phoneticToken: [['えた', 'えた']] },
  ];
  const before = structuredClone(source);
  const resolved = resolveJapaneseReadings(source);
  assert.equal(reading(resolved), 'くわえた');
  assert.deepEqual(resolved.map(t => t.text), source.map(t => t.text));
  assert.equal(resolved[0].gloss, source[0].gloss);
  assert.deepEqual(source, before);
  assert.deepEqual(resolveJapaneseReadings(source, new Set(['咥'])), source);
  const separated = [source[0], { text: ' ', isWord: 0 }, source[1]];
  assert.equal(reading(resolveJapaneseReadings(separated)), '咥 えた');
});

test('ambiguity and existing valid readings are retained', () => {
  const ambiguous = [{ text: '生', isWord: 1, phoneticToken: [['生']] }];
  assert.deepEqual(resolveJapaneseReadings(ambiguous), ambiguous);
  const threshold = [{ text: '閾値', isWord: 1, phoneticToken: [['閾', 'しきい'], ['値', 'ち']] }];
  assert.equal(reading(resolveJapaneseReadings(threshold)), 'しきいち');
  const manual = [{ text: '咥', isWord: 1, phoneticToken: [['咥', 'manual']] }, { text: 'えた', isWord: 1 }];
  assert.equal(resolveJapaneseReadings(manual)[0].phoneticToken[0][1], 'manual');
});

test('standalone spelling shares missing-reading repairs', async () => {
  assert.equal(reading(await spellTokens([{ text: '咥えた', isWord: 1 }])),'くわえた');
  assert.equal(reading(await spellTokens([{ text: '靄', isWord: 1 }])),'もや');
});
