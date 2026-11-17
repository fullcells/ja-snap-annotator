// Dictionary-guided merging: adjacent tokens are joined into one when the joined text is a unit the annotator knows.
// Kuromoji splits more finely than a learner reads: あり + ます, でし + た, 路面 + 電車, のり + ば (seaweed + ば for
// のりば, a boarding place), 背 + が + 高い, ハリー + ・ + ポッター. This replaced the hand-written regroup list
// ("BRUTE MERGE"): the units now live in data (words2 rows and JMdict), not in code.
//
// Two dictionaries, longest match first, left to right:
// - words2 (the snapshot rows): the house lexicon. A row is a unit with a known gloss: word forms (あります, でした,
//   ですか), compounds (遊園地), phrases (背が高い, 歯を磨く, どうやって, ちょっと待って) and names (ハリー・ポッター).
// - JMdict (the glossed spellings and kana forms imported for the gloss fallback): nouns only, for compounds and
//   broken kana words (路面電車, 乗換案内, のりば, みらい), so a verb or auxiliary is never folded into a JMdict noun
//   (き + た is "came", not 北 "north").
//
// Limits, by Kuromoji's analysis of the same text (every morpheme of every piece):
// - Never numbers, and no word starting with a counter: the numbers treatment owns 3日, 一つ目, 何回, 18歳 (joined,
//   一つ目 would be JMdict's "one-eyed" and 18 + 歳未満 would lose its counter reading).
// - Particles: inside a words2 phrase, any (背が高い, 名前を付け, 何でできて); as an ending, て, で or ば (して, 行けば,
//   のりば; not と or が, which join clauses: すると, ですが) and a final か / よ / ね after an auxiliary or adjective
//   (ですか, いいよ; not いる + か, "dolphin"). At the start or end of a JA→EN words2 row (とは, の上, 上に, ことが, には)
//   only when Kuromoji also splits that row on its own: では, でも, なるほど, 時に and もの are single words to Kuromoji,
//   so finding them split in the text means separate pieces (このアプリ + で + は, 何千 + も + の).
// - Symbols only as ・ inside a words2 name; never whitespace or non-words. JMdict joins take nouns and prefixes only.
//
// The token splits (resplitKnownTokens) run after, so a merge they undo is undone as before: 何でできて (a row) is
// re-split into 何 + でできて.
import type { AnnotatedToken, PhoneticToken } from '../types';
import { morphemeSpans, type JapaneseMorpheme as Morpheme } from '../shared/morphemes';

/** The most tokens joined into one word. */
const MAX_PIECES = 6;
const NOUN_POS = new Set(['名詞', '接頭詞']);
const ENDING_BEFORE_FINAL = new Set(['形容詞', '助動詞']); // ですか, ますか, いいよ; not いる + か (いるか, dolphin)
/** Conjunctive particles that end a word form (して, 読んで, 行けば, のりば); not と or が, which join clauses (すると, ですが). */
const WORD_ENDINGS = new Set(['て', 'で', 'ば']);
const JAPANESE = /^[぀-ヿ㐀-鿿々〆ー]+$/u;
/** Numbers as Kuromoji leaves them: 数 morphemes (3, 三), native counts (一つ, 二つ) and question words (いくつ, 何). */
const NUMBER = /^(?:[一二三四五六七八九十]+つ|いくつ|何)$/u;

/**
 * Whether these morphemes (in order) may form one word.
 * - "jmdict": a JMdict noun: nouns and prefixes only (路面 + 電車, のり + ば).
 * - "words2": a words2 word or phrase: particles inside it or as a word ending (背が高い, して, ですか).
 * - "row": a JA→EN words2 row: also a particle at either end (とは, の上, 上に, ことが, には). The caller also checks that
 *   Kuromoji splits the row on its own (see mergeJapaneseDictionaryWords).
 */
function joinable(ms: Morpheme[], mode: 'jmdict' | 'words2' | 'row'): boolean {
	const nounsOnly = mode === 'jmdict';
	return ms.every((m, i) => {
		const inside = i > 0 && i < ms.length - 1;
		if (m.pos === '記号') return !nounsOnly && inside && m.surface_form === '・'; // ハリー・ポッター
		if (m.pos === '助詞') {
			if (!nounsOnly && inside) return true; // a particle between two parts of a words2 phrase: 背が高い, 歯を磨く
			if (mode === 'row') return true;
			if (i === 0) return false;
			if (m.pos_detail_1 === '接続助詞' && WORD_ENDINGS.has(m.surface_form)) return !nounsOnly || (i === ms.length - 1 && m.surface_form === 'ば'); // のりば
			// sentence-final か is tagged 副助詞／並立助詞／終助詞
			const previous = ms[i - 1]!;
			// after an auxiliary or adjective; after a "verb" of one kana only when it is a broken word (ふ + ね: ふね, boat)
			const before = ENDING_BEFORE_FINAL.has(previous.pos) || (previous.pos === '動詞' && i === 1 && [...previous.surface_form].length === 1);
			return !nounsOnly && !!m.pos_detail_1?.split('／').includes('終助詞') && i === ms.length - 1 && before;
		}
		if (m.pos_detail_1 === '数' || NUMBER.test(m.surface_form)) return false;
		if (i === 0 && m.pos_detail_2 === '助数詞') return false; // a counter starts no word: 18歳 + 未満, not 18 + 歳未満
		return nounsOnly ? NOUN_POS.has(m.pos) : true;
	});
}

/**
 * Join adjacent word tokens whose joined text is a words2 row, or a JMdict noun.
 * @param tokens       annotated tokens (no glosses yet)
 * @param text         the annotated text (the tokens' texts joined)
 * @param morphemes    Kuromoji's morphemes for the same text
 * @param isWords2Word whether words2 glosses a text (JA→EN rows, or EN→JA rows read in reverse)
 * @param isWords2Row  whether words2 has a JA→EN row for exactly this text
 * @param isJmdictWord whether JMdict has a glossed word for a text
 * @param isOneMorpheme whether Kuromoji reads a text on its own as a single morpheme
 *
 * A words2 row with a particle at either end joins only when Kuromoji also splits it on its own (に + は, の + 上,
 * と + は). When Kuromoji knows the row as one word (では and でも as conjunctions, なるほど, 時に, もの, すると, いるか
 * "dolphin"), finding it split in the text means separate pieces: このアプリ + で + は, 何千 + も + の, 高く + なる + ほど.
 */
export function mergeJapaneseDictionaryWords(
	tokens: AnnotatedToken[], text: string, morphemes: Morpheme[],
	isWords2Word: (text: string) => boolean, isWords2Row: (text: string) => boolean, isJmdictWord: (text: string) => boolean,
	isOneMorpheme: (text: string) => boolean,
): AnnotatedToken[] {
	if (tokens.map(t => t.text).join('') !== text) return tokens; // tokens and text disagree: leave everything as is
	const ms = morphemeSpans(morphemes);
	const starts: number[] = [];
	tokens.reduce((at, t) => (starts.push(at), at + t.text.length), 0);
	const piece = (i: number) => tokens[i]!.isWord === 1 && JAPANESE.test(tokens[i]!.text);
	const inner = (i: number) => piece(i) || tokens[i]!.text === '・'; // only inside a join: ハリー・ポッター
	const out: AnnotatedToken[] = [];
	for (let i = 0; i < tokens.length; i++) {
		let merged = false;
		if (piece(i)) {
			for (let j = Math.min(i + MAX_PIECES, tokens.length) - 1; j > i && !merged; j--) {
				let ok = true;
				for (let k = i + 1; k <= j && ok; k++) ok = k === j ? piece(k) : inner(k);
				if (!ok) continue;
				const joined = tokens.slice(i, j + 1).map(t => t.text).join('');
				const start = starts[i]!, end = start + joined.length;
				const own = ms.filter(m => m.start < end && m.end > start);
				const edgeParticle = own[0]?.pos === '助詞' || own[own.length - 1]?.pos === '助詞';
				const known = (isWords2Word(joined) && joinable(own, 'words2')) || (isJmdictWord(joined) && joinable(own, 'jmdict'))
					|| (isWords2Row(joined) && joinable(own, 'row') && !(edgeParticle && isOneMorpheme(joined)));
				if (!known) continue;
				const phonetic: PhoneticToken = tokens.slice(i, j + 1).flatMap(t => t.phoneticToken ?? [[t.text]]);
				out.push({ ...tokens[i]!, text: joined, isWord: 1, phoneticToken: phonetic });
				i = j;
				merged = true;
			}
		}
		if (!merged) out.push(tokens[i]!);
	}
	return out;
}
