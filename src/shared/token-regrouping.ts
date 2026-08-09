// Language-neutral helpers for merging configured annotation-token boundaries.

import type { AnnotatedToken, PhoneticToken } from '../types';

function getAllIndexesOfStringInString(subStr: string, str: string): number[] {
	const indices: number[] = [];
	let index = str.indexOf(subStr);
	while (index !== -1) {
		indices.push(index);
		index = str.indexOf(subStr, index + 1);
	}
	return indices;
}

function getTokenIndexStartingAtTextIndex(startTextIndex: number, annotatedTokens: AnnotatedToken[]): number {
	// Can be called with startTextIndex + regroupWord.length to determine the end token index.
	if (startTextIndex === 0) return 0;

	let accumulatedText = "";
	for (let i = 0; i < annotatedTokens.length; i++) {
		accumulatedText += annotatedTokens[i].text;
		if (accumulatedText.length === startTextIndex) return i + 1;
		if (accumulatedText.length > startTextIndex) return -1;
	}
	return -1;
}

export function mergeAnnotatedTokensBetweenIndexes(
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

// Port of bruteMergeForCommonWords3b. A regroup only applies when both ends of
// the configured text align exactly with existing token boundaries.
export function regroupAnnotatedTokens(
	annotatedTokens: AnnotatedToken[],
	regroupWords: string[],
): AnnotatedToken[] {
	let tokens: AnnotatedToken[] = JSON.parse(JSON.stringify(annotatedTokens));
	const text = tokens.map(token => token.text).join('');
	const wordsLongestFirst = [...regroupWords].sort((a, b) => b.length - a.length);

	for (const regroupWord of wordsLongestFirst) {
		const comparableWord = regroupWord.toUpperCase();
		const comparableText = text.toUpperCase();
		if (!comparableText.includes(comparableWord)) continue;

		const startingTextIndexes = getAllIndexesOfStringInString(comparableWord, comparableText);
		for (const startingTextIndex of startingTextIndexes) {
			const startTokenIndex = getTokenIndexStartingAtTextIndex(startingTextIndex, tokens);
			const endTokenIndex = getTokenIndexStartingAtTextIndex(startingTextIndex + regroupWord.length, tokens);
			if (startTokenIndex === -1 || endTokenIndex === -1) continue;

			tokens = mergeAnnotatedTokensBetweenIndexes(startTokenIndex, endTokenIndex - 1, tokens);
		}
	}

	return tokens;
}
