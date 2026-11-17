// JMdict fallback: an English gloss from JMdict for a word token that is still unglossed after words2, the base-form
// fallback and before the context rules (so words2 rows, context rules and counter glosses all still win). Offline:
// the glosses were imported once (scripts/import-jmdict-glosses.mjs) in house style (scripts/jmdict-gloss-style.mjs).
//
// - Words with kanji: the gloss column of the JMdict reading index (src/readings/jmdict-furigana.json), picked by the
//   token's spelling AND its resolved reading (角 かど corner, 角 かく angle). Without a reading match, a spelling's
//   gloss is used only when all its readings agree. A wrong reading therefore gives a wrong gloss, or none.
// - Words in kana: src/glosses/jmdict-kana-glosses.json. A kana form that may be several words has their glosses
//   joined by " / " (かど: "excessive / corner").
// - Inflected words (答えて, 渡らない): their dictionary form, through the base-form fallback's own rules (one inflected
//   word, negative / desire endings split off and glossed from words2). Only dictionary forms with kanji are looked
//   up here; kana verbs and adjectives are left to words2.
// - Content words only, by Kuromoji's analysis: particles, auxiliaries, symbols, fillers, numbers, names and
//   dependent nouns (こと, ため, ところ) are never glossed from JMdict; the house notation and words2 cover them.
import entries from '../readings/jmdict-furigana.json';
import kanaGlosses from './jmdict-kana-glosses.json';
import type { AnnotatedToken } from '../types';
import { applyJapaneseBaseFormGlosses, type JapaneseMorpheme } from './base-form';
export { default as japaneseGlossSource } from './jmdict-glosses-source.json';

/** Kuromoji morphemes also carry the first part-of-speech detail (固有名詞, 非自立, 数 …). */
type Morpheme = JapaneseMorpheme & { pos_detail_1?: string };

const HAN = /\p{Script=Han}/u;
const JAPANESE = /[぀-ヿ㐀-鿿々]/;
const SKIPPED_POS = new Set(['助詞', '助動詞', '記号', 'フィラー', 'その他']);
const SKIPPED_DETAIL = new Set(['非自立', '数']);
const hira = (s: string) => s.normalize('NFKC').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

type Entry = [spelling: string, parts: [string, string?][], gloss?: string];
// spelling → its glossed index entries. The map holds references to the imported tuples (a single tuple, or a list
// when a spelling has several), and readings are joined only when looked up: about 8 MB of heap rather than ~60 MB for
// a map of per-reading objects.
let bySpelling: Map<string, Entry | Entry[]> | undefined;
function entriesFor(text: string): Entry[] {
	if (!bySpelling) {
		bySpelling = new Map();
		for (const entry of entries as Entry[]) {
			if (!entry[2]) continue;
			const known = bySpelling.get(entry[0]);
			if (!known) bySpelling.set(entry[0], entry);
			else if (typeof known[0] === 'string') bySpelling.set(entry[0], [known as Entry, entry]);
			else (known as Entry[]).push(entry);
		}
	}
	const found = bySpelling.get(text);
	return !found ? [] : typeof found[0] === 'string' ? [found as Entry] : found as Entry[];
}
const readingOf = (entry: Entry) => hira(entry[1].map(p => p[1] ?? p[0]).join(''));

/** The JMdict gloss of a word with kanji: for this reading, or the one gloss all its readings share; else null. */
export function japaneseJmdictGloss(text: string, reading?: string | null): string | null {
	const options = entriesFor(text);
	if (!options.length) return null;
	const matching = reading ? options.find(o => readingOf(o) === hira(reading)) : undefined;
	if (matching) return matching[2]!;
	return options.every(o => o[2] === options[0]![2]) ? options[0]![2]! : null;
}

/** Whether JMdict has an English gloss for this text as one word (a spelling with kanji, or a kana form). */
export function isJapaneseJmdictWord(text: string): boolean {
	return HAN.test(text) ? entriesFor(text).length > 0 : japaneseJmdictKanaGloss(text) !== null;
}

/** The JMdict gloss of a word written in kana (several words' glosses joined by " / "); else null. */
export function japaneseJmdictKanaGloss(text: string): string | null {
	return (kanaGlosses as Record<string, string>)[text] ?? null;
}

/** Morphemes with their character spans in the text (word_position is 1-based; otherwise laid end to end). */
function spans(morphemes: Morpheme[]) {
	let at = 0;
	return morphemes.map(m => {
		const start = m.verbose?.word_position ? m.verbose.word_position - 1 : at;
		at = start + m.surface_form.length;
		return { ...m, start, end: at };
	});
}

/**
 * Fill unglossed content-word tokens from JMdict. Tokens that already have a gloss are never changed.
 * @param tokens    annotated tokens (after words2 and the base-form fallback)
 * @param text      the annotated text (the tokens' texts joined)
 * @param morphemes Kuromoji's morphemes for the same text
 * @param words2    the words2 lookup (japaneseSBWordsGlossLookup), for endings split off inflected words
 * @param grouped   token texts that are deliberate groupings (the token-regroups list): never split
 */
export function applyJapaneseJmdictGlosses(
	tokens: AnnotatedToken[], text: string, morphemes: Morpheme[],
	words2: (word: string) => string | null, grouped: ReadonlySet<string>,
): AnnotatedToken[] {
	if (tokens.map(t => t.text).join('') !== text) return tokens; // tokens and text disagree: leave everything as is
	const ms = spans(morphemes);
	let at = 0;
	const filled = tokens.map(token => {
		const start = at, end = at + token.text.length;
		at = end;
		if (!token.isWord || token.gloss || !JAPANESE.test(token.text) || /\d/.test(token.text)) return token;
		const overlapping = ms.filter(m => m.start < end && m.end > start);
		const first = overlapping[0];
		if (!first || SKIPPED_POS.has(first.pos) || SKIPPED_DETAIL.has(first.pos_detail_1 ?? '')) return token;
		// a name (大橋, 新町) is not glossed; a dictionary compound that contains one is (水上 + バス: water bus)
		if (overlapping.every(m => m.pos_detail_1 === '固有名詞')) return token;
		// A kana word Kuromoji does not know comes apart into a kana prefix and a noun (みらい → み + らい, みほん → み + ほん)
		// or a noun and ば (うりば → うり + ば). Such a fragment is not glossed.
		const before = ms.find(m => m.end === start), after = ms.find(m => m.start === end);
		if (!HAN.test(token.text) && before?.pos === '接頭詞' && !HAN.test(before.surface_form)) return token;
		if (!HAN.test(token.text) && after?.surface_form === 'ば' && overlapping[overlapping.length - 1]!.pos === '名詞') return token;
		const reading = token.phoneticToken?.map(p => p[1] ?? p[0]).join('') ?? null;
		const gloss = HAN.test(token.text) ? japaneseJmdictGloss(token.text, reading) : japaneseJmdictKanaGloss(token.text);
		return gloss ? { ...token, gloss } : token;
	});
	// Inflected words: the dictionary form's JMdict gloss (with kanji only), through the base-form fallback's rules.
	// Endings it splits off (ない, たい) are glossed from words2 only.
	const baseGloss = (word: string) => words2(word) ?? (HAN.test(word) ? japaneseJmdictGloss(word) : null);
	return applyJapaneseBaseFormGlosses(filled, text, morphemes, baseGloss, grouped);
}
