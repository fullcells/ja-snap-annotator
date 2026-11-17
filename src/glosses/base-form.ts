// Base-form fallback: a word token that words2 has no row for (答えて, 渡ら, 結び, 乗ったら) is glossed by the words2 row
// of its dictionary form (答える answer, 渡る cross, 結ぶ tie, 乗る ride). Internal only: the base form comes from
// Kuromoji's analysis of the same text and is used for the lookup, never added to the output tokens.
//
// - Fallback only: a token that already has a gloss (from words2, an override or an earlier step) is left alone.
// - words2 only: the base form is looked up in the same words2 rows as surface forms, not in a dictionary.
// - One inflected word only: the token must start with a verb or adjective and be exactly the morphemes Kuromoji found
//   for it. Units merged from words2 rows (どうやって, 背が高い) already have a gloss, so they are never split.
// - Significant endings keep their meaning: when the token also contains a negative (ない, ぬ) or a desire (たい), it is
//   split into the root and the ending, each glossed from words2 (行かなかった → 行か go + なかった …), the way
//   tokenization already splits 行か + ない. Other endings (て, た, たら, ます) stay part of the word.
import type { AnnotatedToken, PhoneticPart } from '../types';
import { morphemeSpans, type JapaneseMorpheme } from '../shared/morphemes';
export type { JapaneseMorpheme } from '../shared/morphemes';

const CONTENT_POS = new Set(['動詞', '形容詞']);
// Endings whose meaning a reader needs (the basic form Kuromoji gives them), and the parts of speech they come as.
const SIGNIFICANT_ENDINGS = new Set(['ない', 'ぬ', 'たい']);
const ENDING_POS = new Set(['助動詞', '形容詞']);
const JAPANESE = /[぀-ヿ㐀-鿿々]/;

/** Split a token's reading parts at a character offset; null when a part (e.g. a kanji with its reading) straddles it. */
function splitPhonetic(parts: PhoneticPart[] | null | undefined, offset: number): [PhoneticPart[], PhoneticPart[]] | null {
	if (!parts?.length) return null;
	const left: PhoneticPart[] = [], right: PhoneticPart[] = [];
	let at = 0;
	for (const part of parts) {
		const length = part[0].length;
		if (at + length <= offset) left.push(part);
		else if (at >= offset) right.push(part);
		else if (part.length === 1 || part[1] === part[0]) { // kana written as itself can be cut anywhere
			const cut = offset - at;
			left.push([part[0].slice(0, cut), part[0].slice(0, cut)]);
			right.push([part[0].slice(cut), part[0].slice(cut)]);
		} else return null;
		at += length;
	}
	return left.length && right.length ? [left, right] : null;
}

/**
 * Gloss unglossed inflected words by their dictionary form's words2 row, splitting off significant endings.
 * @param tokens   annotated tokens (after the words2 surface lookup)
 * @param text     the annotated text (the tokens' texts joined)
 * @param morphemes Kuromoji's morphemes for the same text
 * @param glossOf  the words2 lookup (japaneseSBWordsGlossLookup)
 */
export function applyJapaneseBaseFormGlosses(
	tokens: AnnotatedToken[], text: string, morphemes: JapaneseMorpheme[],
	glossOf: (word: string) => string | null,
): AnnotatedToken[] {
	if (tokens.map(t => t.text).join('') !== text) return tokens; // tokens and text disagree: leave everything as is
	const ms = morphemeSpans(morphemes);
	const out: AnnotatedToken[] = [];
	let at = 0;
	for (const token of tokens) {
		const start = at, end = at + token.text.length;
		at = end;
		if (!token.isWord || token.gloss || !JAPANESE.test(token.text)) { out.push(token); continue; }
		const own = ms.filter(m => m.start >= start && m.end <= end);
		// exactly this token's morphemes, starting with a verb or an adjective
		if (!own.length || own[0].start !== start || own[own.length - 1].end !== end || !CONTENT_POS.has(own[0].pos)) { out.push(token); continue; }
		const base = own[0].basic_form;
		const baseGloss = base && base !== '*' && base !== token.text ? glossOf(base) : null;
		if (!baseGloss) { out.push(token); continue; }
		// a significant ending inside the token: root + ending, each glossed
		const ending = own.findIndex((m, i) => i > 0 && ENDING_POS.has(m.pos) && SIGNIFICANT_ENDINGS.has(m.basic_form));
		const cut = ending > 0 ? own[ending].start - start : -1;
		const parts = cut > 0 ? splitPhonetic(token.phoneticToken, cut) : null;
		if (parts) {
			const endingText = token.text.slice(cut);
			out.push(
				{ ...token, text: token.text.slice(0, cut), phoneticToken: parts[0], gloss: baseGloss },
				{ text: endingText, isWord: 1, phoneticToken: parts[1], gloss: glossOf(endingText) ?? glossOf(own[ending].basic_form) },
			);
			continue;
		}
		out.push({ ...token, gloss: baseGloss });
	}
	return out;
}
