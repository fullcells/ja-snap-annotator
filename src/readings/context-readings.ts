// Readings decided by context: a kanji whose reading depends on its use, from Kuromoji's analysis of the whole text.
//
// 間 on its own (a noun, not a suffix) is あいだ, "between": カフェの間に, 間, 間に. Kuromoji reads it ま, its other
// noun sense (an interval, a room), which learner text almost never means. As a suffix it keeps its reading:
// 新町〜海岸間 (かん), 三日間 (the numbers treatment). Words that contain 間 as one morpheme keep theirs too: 間に合う
// (ま), 時間, 昼間, この間.
import type { AnnotatedToken } from '../types';
import { morphemeSpans, type JapaneseMorpheme } from '../shared/morphemes';
import { precipitationBefore } from '../shared/weather';

export function applyJapaneseContextReadings(tokens: AnnotatedToken[], text: string, morphemes: JapaneseMorpheme[]): AnnotatedToken[] {
	if (tokens.map(t => t.text).join('') !== text) return tokens; // tokens and text disagree: leave everything as is
	const readings = new Map<number, [string, string]>();
	const spans = morphemeSpans(morphemes);
	spans.forEach((m, i) => {
		const previous = spans[i - 1]?.surface_form;
		const next = spans[i + 1]?.surface_form;
		const following = spans[i + 2]?.surface_form;
		const set = (kanji: string, kana: string) => readings.set(m.start, [kanji, kana]);
		if (m.surface_form === '間' && m.pos === '名詞' && m.pos_detail_1 !== '接尾') set('間', 'あいだ');
		if (m.surface_form === '誰' && m.pos_detail_1 === '代名詞') set('誰', 'だれ');
		// The written こんにち sense normally refers to the present era, e.g. 今日では.
		if (m.surface_form === '今日' && (next === 'は' || (next === 'の' && ['ニュース', '新聞', '天気', '予定'].includes(following)))) {
			set('今日', 'きょう');
		}
		if (m.surface_form === '入り' && m.basic_form === '入る' && previous === 'に' && /^ま[すし]$/.test(next ?? '')) set('入', 'はい');
		if (m.surface_form === '撮り' && m.basic_form === '撮る' && previous === 'を' && spans[i - 2]?.surface_form === '写真') {
			set('撮', 'と');
		}
		if (/^降[るっり]$/.test(m.surface_form) && m.pos === '動詞' && precipitationBefore(morphemes, i)) set('降', 'ふ');
		if (m.surface_form === '場' && previous === '風呂') set('場', 'ば');
		if (m.surface_form === '時' && ['朝食', '昼食', '夕食'].includes(previous)) set('時', 'じ');
		if (m.surface_form === '外' && next === 'に' && spans[i + 2]?.basic_form === '出す') set('外', 'そと');
		if (m.surface_form === '留まり' && previous === 'に' && spans[i - 2]?.surface_form === '屋内') {
			set('留', 'とど');
		}
		if (m.surface_form === '灯り' && next === 'まし' && previous === 'が' && spans[i - 2]?.surface_form === '明かり') {
			set('灯', 'とも');
		}
	});
	if (!readings.size) return tokens;
	let at = 0;
	return tokens.map(token => {
		const start = at;
		at += token.text.length;
		if (!token.phoneticToken) return token;
		let offset = start;
		const phoneticToken = [];
		const parts = token.phoneticToken;
		for (let i = 0; i < parts.length;) {
			const part = parts[i];
			const replacement = readings.get(offset);
			if (replacement) {
				let end = i + 1;
				let written = part[0];
				while (written.length < replacement[0].length && end < parts.length) written += parts[end++][0];
				if (written === replacement[0]) {
					const original = parts.slice(i, end);
					phoneticToken.push(...(original.map(p => p[1] ?? p[0]).join('') === replacement[1] ? original : [replacement]));
					offset += written.length;
					i = end;
					continue;
				}
			}
			phoneticToken.push(part);
			offset += part[0].length;
			i++;
		}
		return { ...token, phoneticToken };
	});
}
