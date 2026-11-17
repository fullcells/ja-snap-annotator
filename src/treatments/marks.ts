// Marks: 〇 and × as the circle and cross of true/false and choice questions (〇か×を書いてください, 正しいものに〇を
// つけてください) are words, read まる and ばつ and glossed "circle" and "cross". Deterministic and offline.
//
// - Arithmetic keeps its reading: × between two numbers is かける (3×4, 2 × 3), as before.
// - A 〇 inside a number is a zero (二〇二六年) and is left alone.
// - Variants: 〇 ○ ◯ (circle), × ✕ ✖ (cross).
import type { AnnotatedToken } from '../types';

const CIRCLES = new Set(['〇', '○', '◯']);
const CROSSES = new Set(['×', '✕', '✖']);
const NUMBER = /^(?:[0-9０-９]+(?:[.,][0-9０-９]+)*|[〇零一二三四五六七八九十百千万億兆]+)$/;

/** The nearest token on one side that is not whitespace. */
function neighbour(tokens: AnnotatedToken[], index: number, step: 1 | -1): AnnotatedToken | undefined {
	for (let i = index + step; i >= 0 && i < tokens.length; i += step) if (!/^\s+$/u.test(tokens[i]!.text)) return tokens[i];
	return undefined;
}

/** Read and gloss 〇 / × used as marks; leave arithmetic and numerals as they are. */
export function applyJapaneseMarks(tokens: AnnotatedToken[]): AnnotatedToken[] {
	return tokens.map((token, index) => {
		const circle = CIRCLES.has(token.text), cross = CROSSES.has(token.text);
		if (!circle && !cross) return token;
		const before = neighbour(tokens, index, -1)?.text ?? '', after = neighbour(tokens, index, 1)?.text ?? '';
		if (circle && (NUMBER.test(before) || NUMBER.test(after))) return token;   // 二〇二六: a zero
		if (cross && NUMBER.test(before) && NUMBER.test(after)) return token;      // 3×4: times
		return { ...token, isWord: 1, phoneticToken: [[token.text, circle ? 'まる' : 'ばつ']], gloss: circle ? 'circle' : 'cross' };
	});
}
