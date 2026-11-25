import type { JapaneseMorpheme } from './morphemes';

/** The subject immediately before a weather use of 降る, with an optional adverb. */
export function precipitationBefore(morphemes: JapaneseMorpheme[], index: number): 'rain' | 'snow' | undefined {
	let before = index - 1;
	while (morphemes[before]?.pos === '副詞' || morphemes[before]?.pos_detail_1 === '副詞可能') {
		if (morphemes[before].surface_form.endsWith('雨') || morphemes[before].surface_form.endsWith('雪')) break;
		before--;
	}
	if (!['が', 'は'].includes(morphemes[before]?.surface_form)) return;
	const subject = morphemes[before - 1]?.surface_form;
	if (['雨', '大雨', '小雨'].includes(subject)) return 'rain';
	if (['雪', '大雪', '小雪'].includes(subject)) return 'snow';
}
