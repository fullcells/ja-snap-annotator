// Import English glosses from JMdict (jmdict-simplified's jmdict-eng release) for the offline gloss fallback:
//   npm run glosses:update -- [<release tag> | <local jmdict-eng-*.json> <release tag>]
// With no argument it uses the release recorded in src/glosses/jmdict-glosses-source.json. The only network step is
// fetching that release (once, at import time); annotation stays offline.
//
// Writes, in house style (scripts/jmdict-gloss-style.mjs):
//   src/readings/jmdict-furigana.json       a third element on each [text, reading parts] entry: its gloss, when JMdict
//                                           has one for that spelling AND reading (角 かど corner, 角 かく angle)
//   src/glosses/jmdict-kana-glosses.json    { kana: gloss } for words written in kana: kana-only entries (エレベーター),
//                                           senses usually written in kana, and readings of exactly one common word
//                                           (きっぷ 切符 ticket)
//   src/glosses/jmdict-glosses-source.json  release, dictionary date, sha256, counts, licence
// Keep the JMdict release close to the reading index's (src/readings/jmdict-furigana-source.json) so their entries
// line up; re-run this after `npm run readings:update`.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { entryGloss } from './jmdict-gloss-style.mjs';

const SOURCE_FILE = 'src/glosses/jmdict-glosses-source.json';
const previous = await readFile(SOURCE_FILE, 'utf8').then(JSON.parse).catch(() => null);
const [arg1, arg2] = process.argv.slice(2);
const local = arg1 && /\.json$/.test(arg1) ? arg1 : null;
const tag = local ? arg2 : arg1 ?? previous?.tag;
if (!tag) throw new Error('Supply the jmdict-simplified release tag (e.g. 3.6.2+20260928191014).');
const source = `https://github.com/scriptin/jmdict-simplified/releases/download/${encodeURIComponent(tag)}/jmdict-eng-${tag}.json.tgz`;

/** The first .json file in a tar archive (no dependency: tar is 512-byte headers followed by file data). */
function untarJson(tar) {
	for (let at = 0; at + 512 <= tar.length;) {
		const name = tar.subarray(at, at + 100).toString('utf8').replace(/\0.*$/s, '');
		if (!name) break;
		const size = parseInt(tar.subarray(at + 124, at + 136).toString('utf8').replace(/\0.*$/s, '').trim() || '0', 8);
		if (name.endsWith('.json')) return tar.subarray(at + 512, at + 512 + size);
		at += 512 + Math.ceil(size / 512) * 512;
	}
	throw new Error('No .json file in the release archive.');
}
let raw;
if (local) raw = await readFile(local);
else {
	const response = await fetch(source);
	if (!response.ok) throw new Error(`JMdict download failed: ${response.status}`);
	raw = untarJson(gunzipSync(Buffer.from(await response.arrayBuffer())));
}
const sha256 = createHash('sha256').update(raw).digest('hex');
const jmdict = JSON.parse(raw.toString('utf8').replace(/^﻿/, ''));
const toHiragana = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const isCommon = entry => entry.kanji.some(k => k.common) || entry.kana.some(k => k.common);
const appliesTo = (kana, kanji) => kana.appliesToKanji.includes('*') || kana.appliesToKanji.includes(kanji);

// (spelling, reading) → entries, common ones first, then in JMdict order
const byForm = new Map();
for (const entry of jmdict.words) for (const k of entry.kanji) for (const r of entry.kana) {
	if (!appliesTo(r, k.text)) continue;
	const key = `${k.text}\t${toHiragana(r.text)}`;
	(byForm.get(key) ?? byForm.set(key, []).get(key)).push({ entry, kanji: k.text, kana: r.text });
}
for (const list of byForm.values()) list.sort((a, b) => Number(isCommon(b.entry)) - Number(isCommon(a.entry)));

// 1. the reading index: a gloss for each entry whose spelling and reading JMdict knows
const index = JSON.parse((await readFile('src/readings/jmdict-furigana.json', 'utf8')).replace(/^﻿/, ''));
let glossed = 0;
const updated = index.map(([text, parts]) => {
	const reading = toHiragana(parts.map(p => p[1] ?? p[0]).join(''));
	const gloss = (byForm.get(`${text}\t${reading}`) ?? []).map(c => entryGloss(c.entry, c.kanji, c.kana)).find(Boolean);
	if (gloss) glossed++;
	return gloss ? [text, parts, gloss] : [text, parts];
});

// 2. words written in kana (エレベーター, きっぷ, まっすぐ), keyed as written. A kana form is glossed only when it points to
// one word: of the entries that have it as a common kana form (JMdict's priority tags), there must be exactly one
// (きっぷ: 切符 ticket; かど is 角 corner and 門 gate, so none). With no common entry, exactly one entry may have it,
// and it must be written in kana (a kana-only word, or a sense marked "usually kana"). A kana form shared with a
// function word (でも, ため) counts as ambiguous too. Single kana are left out: they are mostly particles.
const byKana = new Map();
for (const entry of jmdict.words) for (const r of entry.kana) {
	if ([...r.text].length < 2) continue;
	const kanji = entry.kanji.find(k => appliesTo(r, k.text))?.text ?? null;
	const inKana = !entry.kanji.length || entry.sense.some(s => s.misc.includes('uk') && (s.appliesToKana.includes('*') || s.appliesToKana.includes(r.text)));
	(byKana.get(r.text) ?? byKana.set(r.text, []).get(r.text)).push({ entry, kanji, common: r.common, inKana });
}
const kanaGlosses = new Map();
for (const [kana, list] of byKana) {
	const entries = new Set(list.map(c => c.entry)), common = list.filter(c => c.common);
	const only = common.length ? (new Set(common.map(c => c.entry)).size === 1 ? common[0] : null)
		: (entries.size === 1 && list[0].inKana ? list[0] : null);
	if (!only) continue;
	// a word usually written in kana takes its kana sense; others their sense for the kanji spelling
	const uk = only.inKana && only.entry.kanji.length ? only.entry.sense.find(s => s.misc.includes('uk')) : null;
	const gloss = uk ? entryGloss({ ...only.entry, sense: [uk, ...only.entry.sense.filter(s => s !== uk)] }, null, kana)
		: entryGloss(only.entry, only.kanji, kana);
	if (gloss) kanaGlosses.set(kana, gloss);
}
const kanaObject = Object.fromEntries([...kanaGlosses].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

await writeFile('src/readings/jmdict-furigana.json', JSON.stringify(updated));
await mkdir('src/glosses', { recursive: true });
await writeFile('src/glosses/jmdict-kana-glosses.json', JSON.stringify(kanaObject));
await writeFile(SOURCE_FILE, JSON.stringify({
	tag, source, sha256, dictDate: jmdict.dictDate, jmdictVersion: jmdict.version, words: jmdict.words.length,
	readingIndexGlosses: glossed, readingIndexEntries: index.length, kanaGlosses: kanaGlosses.size,
	license: 'CC-BY-SA-4.0', attribution: 'JMdict © EDRDG / Jim Breen; JSON conversion by jmdict-simplified (scriptin).',
	documentation: 'https://github.com/scriptin/jmdict-simplified', licenseUrl: 'https://www.edrdg.org/edrdg/licence.html',
}, null, 2) + '\n');
console.log(`JMdict ${jmdict.dictDate}: glosses for ${glossed} of ${index.length} reading-index entries, ${kanaGlosses.size} kana words.`);
