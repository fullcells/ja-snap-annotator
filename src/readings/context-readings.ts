// Readings decided by context: a kanji whose reading depends on its use, from Kuromoji's analysis of the whole text.
//
// 間 on its own (a noun, not a suffix) is あいだ, "between": カフェの間に, 間, 間に. Kuromoji reads it ま, its other
// noun sense (an interval, a room), which learner text almost never means. As a suffix it keeps its reading:
// 新町〜海岸間 (かん), 三日間 (the numbers treatment). Words that contain 間 as one morpheme keep theirs too: 間に合う
// (ま), 時間, 昼間, この間.
import type { AnnotatedToken } from '../types';
import { morphemeSpans, type JapaneseMorpheme } from '../shared/morphemes';

export function applyJapaneseContextReadings(tokens: AnnotatedToken[], text: string, morphemes: JapaneseMorpheme[]): AnnotatedToken[] {
	if (tokens.map(t => t.text).join('') !== text) return tokens; // tokens and text disagree: leave everything as is
	const between = new Set(morphemeSpans(morphemes)
		.filter(m => m.surface_form === '間' && m.pos === '名詞' && m.pos_detail_1 !== '接尾')
		.map(m => m.start));
	if (!between.size) return tokens;
	let at = 0;
	return tokens.map(token => {
		const start = at;
		at += token.text.length;
		if (!token.phoneticToken || !token.text.includes('間')) return token;
		let offset = start;
		const phoneticToken = token.phoneticToken.map(part => {
			const here = offset;
			offset += part[0].length;
			return part[0] === '間' && between.has(here) ? ['間', 'あいだ'] as [string, string] : part;
		});
		return { ...token, phoneticToken };
	});
}
