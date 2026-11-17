import type { AnnotatedToken, PhoneticToken } from '../types';
import { morphemeSpans, type JapaneseMorpheme } from '../shared/morphemes';

/** Merge tokens startTokenIndex..lastTokenIndex into one (texts joined; glosses and readings concatenated). */
function mergeAnnotatedTokensBetweenIndexes(
	startTokenIndex: number,
	lastTokenIndex: number,
	annotatedTokens: AnnotatedToken[],
): AnnotatedToken[] {
	if (startTokenIndex === -1 || lastTokenIndex === -1) return annotatedTokens;
	if (startTokenIndex >= lastTokenIndex) return annotatedTokens;

	// Only set gloss or phoneticToken if those properties existed on the input tokens.
	const tokensHadGloss = annotatedTokens.some(token => Object.prototype.hasOwnProperty.call(token, 'gloss'));
	const tokensHadPhoneticToken = annotatedTokens.some(token => Object.prototype.hasOwnProperty.call(token, 'phoneticToken'));

	const preTokens = annotatedTokens.slice(0, startTokenIndex);
	const mergeTokens = annotatedTokens.slice(startTokenIndex, lastTokenIndex + 1);
	const postTokens = annotatedTokens.slice(lastTokenIndex + 1);
	const mergedToken: AnnotatedToken = {
		text: mergeTokens.map(token => token.text).join(''),
		isWord: mergeTokens.some(token => token.isWord === 1) ? 1 : 0,
	};

	if (tokensHadGloss) {
		mergedToken.gloss = mergeTokens.map(token => token.gloss ?? '').join(' ').replace(/\s+/g, ' ').trim() || null;
	}

	if (tokensHadPhoneticToken) {
		if (mergeTokens.every(token => !token.phoneticToken)) {
			mergedToken.phoneticToken = null;
		} else {
			mergedToken.phoneticToken = mergeTokens.flatMap(
				(token): PhoneticToken => token.phoneticToken ?? [[token.text]],
			);
		}
	}

	return [...preTokens, mergedToken, ...postTokens];
}


// Moved from tokenizeAndSpellText2bii.ts so Japanese token treatment is owned
// by the Japanese annotator rather than its general language-dispatch wrapper.
/**
 * Join a verb or adjective stem and its て / で (入っ + て → 入って, 飲ん + で → 飲んで).
 * @param morphemes Kuromoji's morphemes for the same text, when available: then only a て / で that Kuromoji reads as the
 *   te-form ending (接続助詞) is joined, so a noun + the particle or copula で stays apart (赤ちゃん + で, 話し合い + で).
 */
export function mergeJapaneseTeForms(annotatedTokens: AnnotatedToken[], morphemes?: JapaneseMorpheme[]): AnnotatedToken[] {
	// H: ACTUALLY, Tempted to resplit 'Te' Form out, and mark e.g. [入っ] as a suffix - since it can be connected with so many reusable forms [て,た,[た,だろう],[た,でしょう],たら,[て,{いる}(and other forms of iru - to mean '-ing'), ]]. Thoughts: Need to have access to Kuromoji Tokenizer Info to properly gloss [入っ]: Could either combine this glossing in MyJA, or re-call it here. // Or perhaps keep this for just COMMON Verbs (so the overall annotation doesn't look too messy) - 20260611

	// e.g.
	// […,入っ,て,…] -> […,入って,…] / […,かかっ,て,…] -> […,かかって,…] / […,飲ん,で,…] -> […,飲んで,…] / […,読ん,で,…] -> […,読んで,…] / […,書い,て,…] -> […,書いて,…] / […,泳い,で,…] -> […,泳いで,…] / […,話し,て,…] -> […,話して,…] / […,食べ,て,…] -> […,食べて,…] / […,着,て,…] -> […,着て,…] / […,見,て,…] -> […,見て,…] / […,高く,て,…] -> […,高くて,…]
	let tokens: AnnotatedToken[] = JSON.parse(JSON.stringify(annotatedTokens));

	// Ichidan verbs generally attach て to the ます-stem: 食べ + て, 起き + て, 借り + て, 寝 + て, etc.
	const endsWithLikelyIchidanStemKana = (text: string): boolean =>
		/[いきぎしじちぢにひびぴみりえけげせぜてでねへべぺめれ]$/.test(text);

	// Common kanji-only ichidan stems where tokenizers may split the stem from て: 着 + て, 見 + て, 出 + て, etc.
	const commonKanjiOnlyIchidanTeStems = new Set(['着','見','出','寝','居','得','経','似','煮','射','鋳','干',]);

	const ms = morphemes && annotatedTokens.map(t => t.text).join('') === morphemes.map(m => m.surface_form).join('')
		? morphemeSpans(morphemes) : undefined;
	/** Whether the token at index is a te-form て / で by Kuromoji's analysis (true when there is no analysis to ask). */
	const isTeEnding = (index: number): boolean => {
		if (!ms) return true;
		const start = tokens.slice(0, index).reduce((at, t) => at + t.text.length, 0);
		const m = ms.find(m => m.start === start && m.end === start + tokens[index].text.length);
		return !m || (m.pos === '助詞' && m.pos_detail_1 === '接続助詞');
	};

	for (let i = 0; i < tokens.length - 1; i++) {
		const current = tokens[i].text;
		const next = tokens[i + 1].text;
		if ((next === 'て' || next === 'で') && !isTeEnding(i + 1)) continue;
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
