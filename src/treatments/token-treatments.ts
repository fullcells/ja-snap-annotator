import { mergeAnnotatedTokensBetweenIndexes } from '../shared/token-regrouping';
import type { AnnotatedToken } from '../types';

// Moved from tokenizeAndSpellText2bii.ts so Japanese token treatment is owned
// by the Japanese annotator rather than its general language-dispatch wrapper.
export function mergeJapaneseTeForms(annotatedTokens: AnnotatedToken[]): AnnotatedToken[] {
	// H: ACTUALLY, Tempted to resplit 'Te' Form out, and mark e.g. [入っ] as a suffix - since it can be connected with so many reusable forms [て,た,[た,だろう],[た,でしょう],たら,[て,{いる}(and other forms of iru - to mean '-ing'), ]]. Thoughts: Need to have access to Kuromoji Tokenizer Info to properly gloss [入っ]: Could either combine this glossing in MyJA, or re-call it here. // Or perhaps keep this for just COMMON Verbs (so the overall annotation doesn't look too messy) - 20260611

	// e.g.
	// […,入っ,て,…] -> […,入って,…] / […,かかっ,て,…] -> […,かかって,…] / […,飲ん,で,…] -> […,飲んで,…] / […,読ん,で,…] -> […,読んで,…] / […,書い,て,…] -> […,書いて,…] / […,泳い,で,…] -> […,泳いで,…] / […,話し,て,…] -> […,話して,…] / […,食べ,て,…] -> […,食べて,…] / […,着,て,…] -> […,着て,…] / […,見,て,…] -> […,見て,…] / […,高く,て,…] -> […,高くて,…]
	let tokens: AnnotatedToken[] = JSON.parse(JSON.stringify(annotatedTokens));

	// Ichidan verbs generally attach て to the ます-stem: 食べ + て, 起き + て, 借り + て, 寝 + て, etc.
	const endsWithLikelyIchidanStemKana = (text: string): boolean =>
		/[いきぎしじちぢにひびぴみりえけげせぜてでねへべぺめれ]$/.test(text);

	// Common kanji-only ichidan stems where tokenizers may split the stem from て: 着 + て, 見 + て, 出 + て, etc.
	const commonKanjiOnlyIchidanTeStems = new Set(['着','見','出','寝','居','得','経','似','煮','射','鋳','干',]);

	for (let i = 0; i < tokens.length - 1; i++) {
		const current = tokens[i].text;
		const next = tokens[i + 1].text;
		// 入っ + て -> 入って / 買っ + て -> 買って / 走っ + て -> 走って
		const isSmallTsuTeForm = current.endsWith('っ') && next === 'て';
		// 飲ん + で -> 飲んで / 読ん + で -> 読んで
		const isNDeForm = current.endsWith('ん') && next === 'で';
		// 書い + て -> 書いて
		const isITeForm = current.endsWith('い') && next === 'て';
		// 泳い + で -> 泳いで
		const isIDeForm = current.endsWith('い') && next === 'で';
		// 話し + て -> 話して / まし + て -> まして
		const isShiTeForm = current.endsWith('し') && next === 'て';
		// 食べ + て -> 食べて / 起き + て -> 起きて / 借り + て -> 借りて / 疲れ + て -> 疲れて
		const isIchidanTeForm = next === 'て' && endsWithLikelyIchidanStemKana(current);
		// 着 + て -> 着て / 見 + て -> 見て / 出 + て -> 出て
		const isCommonKanjiOnlyIchidanTeForm = next === 'て' && commonKanjiOnlyIchidanTeStems.has(current);
		// 高く + て -> 高くて / なく + て -> なくて / よく + て -> よくて
		const isIAdjectiveTeForm = current.endsWith('く') && next === 'て';

		if (isSmallTsuTeForm || isNDeForm || isITeForm || isIDeForm || isShiTeForm || isIchidanTeForm || isCommonKanjiOnlyIchidanTeForm || isIAdjectiveTeForm) {
			tokens = mergeAnnotatedTokensBetweenIndexes(i, i + 1, tokens);
			i--; // Recheck current position in case of consecutive patterns.
		}
	}

	return tokens;
}
