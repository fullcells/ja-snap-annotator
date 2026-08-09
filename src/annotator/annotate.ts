import MyKuroshiro from "../tokenization/my-kuroshiro/core.js";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";
import japaneseTokenRegroups from '../treatments/token-regroups';
import { mergeJapaneseTeForms } from '../treatments/token-treatments';
import { regroupAnnotatedTokens } from '../shared/token-regrouping';
import { applyJapaneseGlossTreatments } from '../glosses/treatments';
import {
	applyJapaneseSBWordsGlosses,
	getSnapshotJapaneseSBWords,
} from '../snapshot/japanese-sb-words';
import type { AnnotatedToken, PhoneticPart, PhoneticToken, SBWordRow2 } from '../types';
export { refreshJapaneseSBWordsSnapshot } from '../snapshot/japanese-sb-words';
// Instantiate
const kuroshiro = new MyKuroshiro.Kuroshiro();

export type JaSnapAnnotatorConfiguration = {
	// Node consumers can omit this. Browser/extension builds should point it at
	// their packaged copy of Kuromoji's dictionary assets.
	dictionaryPath?: string;
};

let configuration: JaSnapAnnotatorConfiguration = {};

export function configure(nextConfiguration: JaSnapAnnotatorConfiguration): void {
	if (kuroshiro._analyzer || kuroshiroInitPromise) {
		throw new Error('Configure ja-snap-annotator before its first annotation.');
	}
	configuration = { ...configuration, ...nextConfiguration };
}

let kuroshiroInitPromise: Promise<void> | null = null;
async function ensureKuroshiroInitialized(): Promise<void> {
	if (kuroshiro._analyzer) return; // already initialized

	if (!kuroshiroInitPromise) {
		const analyzerOptions = configuration.dictionaryPath
			? { dictPath: configuration.dictionaryPath }
			: undefined;
		kuroshiroInitPromise = kuroshiro
			// Without an override, the analyzer resolves its installed Kuromoji
			// dictionary automatically in Node.
			.init(new KuromojiAnalyzer(analyzerOptions))
			.catch((err) => {
				kuroshiroInitPromise = null; // allow retry on next call
				throw err;
			});
	}

	await kuroshiroInitPromise;
}

const spellingOverrides: Record<string, string> = {
	'色': 'いろ',
};
const symbolSpellingOverrides: Record<string, string> = {
	'+': 'たす',
	'=': 'は',
	'×': 'かける',
	'÷': 'わる',
	'−': 'ひく',
};
// Split one Kuroshiro token into separate annotation tokens. Each replacement is
// re-analysed below, so its spelling still comes from Kuroshiro.
const tokenSplits: Record<string, string[]> = {
	"チキンヌードルスープ": ["チキン","ヌードル","スープ"],
	"そこで": ["そこ","で"],
	// "盤上": ["盤","上"], // spelling may change if tokenized separately
	"目と": ["目","と"],
	'青色': ['青', '色'],
	"赤色":["赤","色"],
	"左側":["左","側"],
	"右側":["右","側"],
	"外側":["外","側"],
	"何でできて":["何","でできて"],
};
const regexEmoji = /^(\p{Extended_Pictographic}|(\p{Regional_Indicator}{2}))/u; // Helps ensure emojis do not get split during phonetics reformat.
const japaneseNumerals = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const japaneseLargeUnits = ['', '万', '億', '兆', '京', '垓'];
type CounterReading = { number?: string; counter?: string };
// Contextual readings for a number followed by a separate counter token. Some
// counters change their initial consonant, so both tokens can need an override.
const counterReadings: Record<string, Record<string, CounterReading>> = {
	'つ': {
		'1': { number: 'ひと' }, '2': { number: 'ふた' }, '3': { number: 'みっ' }, '4': { number: 'よっ' }, '5': { number: 'いつ' },
		'6': { number: 'むっ' }, '7': { number: 'なな' }, '8': { number: 'やっ' }, '9': { number: 'ここの' }, '10': { number: 'とお' },
	},
	'人': {
		'1': { number: 'ひと', counter: 'り' }, '2': { number: 'ふた', counter: 'り' },
		'7': { number: 'しち' },
	},
	'本': {
		'1': { number: 'いっ', counter: 'ぽん' }, '3': { number: 'さん', counter: 'ぼん' },
		'6': { number: 'ろっ', counter: 'ぽん' }, '8': { number: 'はっ', counter: 'ぽん' }, '10': { number: 'じゅっ', counter: 'ぽん' },
	},
	'個': {
		'1': { number: 'いっ' }, '6': { number: 'ろっ' }, '8': { number: 'はっ' }, '10': { number: 'じゅっ' },
	},
	'回': {
		'1': { number: 'いっ' }, '6': { number: 'ろっ' }, '8': { number: 'はっ' }, '10': { number: 'じゅっ' },
	},
	'匹': {
		'1': { number: 'いっ', counter: 'ぴき' }, '3': { number: 'さん', counter: 'びき' },
		'6': { number: 'ろっ', counter: 'ぴき' }, '8': { number: 'はっ', counter: 'ぴき' }, '10': { number: 'じゅっ', counter: 'ぴき' },
	},
	'分': {
		'1': { number: 'いっ', counter: 'ぷん' }, '3': { number: 'さん', counter: 'ぷん' },
		'6': { number: 'ろっ', counter: 'ぷん' }, '8': { number: 'はっ', counter: 'ぷん' }, '10': { number: 'じゅっ', counter: 'ぷん' },
	},
	'歳': {
		'1': { number: 'いっ' }, '8': { number: 'はっ' }, '10': { number: 'じゅっ' },
	},
	'才': {
		'1': { number: 'いっ' }, '8': { number: 'はっ' }, '10': { number: 'じゅっ' },
	},
	'月': {
		'*': { counter: 'がつ' },
	},
};

const withPhoneticToken = (token: AnnotatedToken, phoneticToken: PhoneticToken | null): AnnotatedToken => ({
	...token,
	phoneticToken,
});

async function expandSplitJaToken(jaToken: any): Promise<any[]> {
	const splitTokens = tokenSplits[jaToken.surfaceForm];
	if (!splitTokens) return [jaToken];

	const splitAnalyses = await Promise.all(
		splitTokens.map((splitToken) =>
			kuroshiro.convert(splitToken, { mode: "furigana", to: "hiragana" })
		)
	);
	return splitAnalyses.flatMap((analysis: any) => analysis.tokens);
}

function arabicIntegerToJapaneseNumeral(text: string): string | null {
	// Leave leading-zero values (e.g. IDs) and non-integers untouched.
	if (!/^(?:0|[1-9]\d*)$/.test(text)) return null;
	if (text === '0') return japaneseNumerals[0];

	const groups: string[] = [];
	for (let end = text.length; end > 0; end -= 4) {
		groups.unshift(text.slice(Math.max(0, end - 4), end));
	}
	if (groups.length > japaneseLargeUnits.length) return null;

	return groups.map((group, groupIndex) => {
		const paddedGroup = group.padStart(4, '0');
		const smallUnits = ['千', '百', '十', ''];
		const groupText = paddedGroup.split('').map((digit, index) => {
			if (digit === '0') return '';
			const omitOne = digit === '1' && smallUnits[index] !== '';
			return `${omitOne ? '' : japaneseNumerals[Number(digit)]}${smallUnits[index]}`;
		}).join('');
		return groupText ? `${groupText}${japaneseLargeUnits[groups.length - groupIndex - 1]}` : '';
	}).join('');
}

async function jaTokenToPhoneticTokenWithArabicNumeral(jaToken: any): Promise<PhoneticToken> {
	const japaneseNumeral = arabicIntegerToJapaneseNumeral(jaToken.surfaceForm);
	if (!japaneseNumeral) return jaTokenToPhoneticToken(jaToken);

	const numeralAnalysis = await kuroshiro.convert(japaneseNumeral, { mode: "furigana", to: "hiragana" });
	const reading = numeralAnalysis.tokens
		.flatMap((numeralToken: any) => jaTokenToPhoneticToken(numeralToken))
		.map((part: PhoneticPart) => part[1] ?? part[0])
		.join('');

	return [[jaToken.surfaceForm, reading]];
}

function getCounterReading(counterText: string | undefined, numberText: string | undefined): CounterReading | undefined {
	if (!counterText || !numberText) return undefined;
	const readingsForCounter = counterReadings[counterText];
	if (!readingsForCounter) return undefined;
	return readingsForCounter[numberText]
		?? (/^(?:0|[1-9]\d*)$/.test(numberText) ? readingsForCounter['*'] : undefined);
}

async function tokenizeAndSpellWithKuroshiro(text: string): Promise<AnnotatedToken[]> {
	// Wait until Kuroshiro has initialized, then proceed.
	await ensureKuroshiroInitialized();

	const ja_analysis = await kuroshiro.convert(text, { mode: "furigana", to: "hiragana" }); // Customized in H's MyKuroshiro to export Kuroshiro's InternalTokens instead of Ruby-HTML.
	const jaTokens = (await Promise.all(ja_analysis.tokens.map(expandSplitJaToken))).flat();

	// REMAP TOKENS TO DESIRED FORMAT
	// console.log("MyJa: tokenizeAndSpell: ja_analysis.tokens", JSON.stringify(ja_analysis.tokens));
	// - NOTE: We do have POS (Nouns/Verbs etc.) now, so it is possible to a-bit-more-dynamically tokenize words like: "には"
	// - 名詞 — Noun, 助詞 — Particle (e.g. incorrect: [し,て]), 形容詞 — Adjective, 助動詞 — Auxiliary verb (e.g. [ませ,ん]), 記号 — Symbol/Punctuation (e.g. [。])
	return Promise.all(jaTokens.map(async (jaToken: any, index: number) => {
		// DETERMINE IS_WORD
		// Listing "Numbers" as "Words" - this was done for T.R.I.P.S., though can be removed.
		let is_word: boolean = jaToken.strType != 3; // 'John','。','123'.strType = 3 // (0 = kanji, 2 = hiragana)
		if (!isNaN(parseInt(jaToken.surfaceForm))) is_word = true; // i.e. if it is a number
		if (jaToken.surfaceForm == "・") is_word = false; // Keep "・" in "アルベルト・アインシュタイン" as non-word.
		const symbolSpelling = symbolSpellingOverrides[jaToken.surfaceForm];
		if (symbolSpelling) is_word = true;
		const isDecimalPoint = jaToken.surfaceForm === '.'
			&& /^(?:0|[1-9]\d*)$/.test(jaTokens[index - 1]?.surfaceForm ?? '')
			&& /^(?:0|[1-9]\d*)$/.test(jaTokens[index + 1]?.surfaceForm ?? '');
		const contextualNumberReading = getCounterReading(jaTokens[index + 1]?.surfaceForm, jaToken.surfaceForm);
		const contextualCounterReading = getCounterReading(jaToken.surfaceForm, jaTokens[index - 1]?.surfaceForm);
		if (isDecimalPoint) is_word = true;

		// DETERMINE PHONETICTOKEN
		const annotatedToken: AnnotatedToken = {
			text: jaToken.surfaceForm,
			isWord: is_word ? 1 : 0,
		};

		if (isDecimalPoint) return withPhoneticToken(annotatedToken, [['.', 'てん']]);
		if (symbolSpelling) return withPhoneticToken(annotatedToken, [[jaToken.surfaceForm, symbolSpelling]]);
		if (contextualNumberReading?.number) return withPhoneticToken(annotatedToken, [[jaToken.surfaceForm, contextualNumberReading.number]]);
		if (contextualCounterReading?.counter) return withPhoneticToken(annotatedToken, [[jaToken.surfaceForm, contextualCounterReading.counter]]);

		return is_word
			? withPhoneticToken(annotatedToken, await jaTokenToPhoneticTokenWithArabicNumeral(jaToken))
			: annotatedToken;
	}));
}

export type JapaneseAnnotateOptions = {
	// Server-side wrappers can supply their current cache. Offline-first clients
	// normally omit this and use MyJa's bundled/refreshed JapaneseSBWords instead.
	latestSBWords?: SBWordRow2[];
};

// Complete offline-first Japanese annotation. The bundled JapaneseSBWords are
// usable without a connection; browser clients refresh them locally in the
// background. Truly unknown English glosses remain null for an outer wrapper.
export async function annotate(text: string, options: JapaneseAnnotateOptions = {}): Promise<AnnotatedToken[]> {
	// Tokenize And Spell
	let tokens = await tokenizeAndSpellWithKuroshiro(text);
	tokens = regroupAnnotatedTokens(tokens, japaneseTokenRegroups);
	tokens = mergeJapaneseTeForms(tokens);
	tokens = await resplitKnownTokens(tokens);
	// Glossify
	const japaneseSBWords = options.latestSBWords ?? await getSnapshotJapaneseSBWords();
	tokens = applyJapaneseSBWordsGlosses(tokens, japaneseSBWords);
	// Apply deterministic/context-aware overrides last so they remain stronger
	// than a generic JapaneseSBWords match.
	tokens = applyJapaneseGlossTreatments(tokens);
	// Output
	return tokens;
}

// Compatibility name retained for existing consumers. The implementation now
// performs the complete offline Japanese annotation described above.
export async function tokenizeAndSpell(text: string): Promise<AnnotatedToken[]> {
	return annotate(text);
}

function collapseAnnotatedTokens(tokens: AnnotatedToken[]): AnnotatedToken {
	const phoneticToken = tokens.flatMap((token): PhoneticToken => token.phoneticToken ?? [[token.text]]);
	return withPhoneticToken({
		text: tokens.map(token => token.text).join(''),
		isWord: tokens.some(token => token.isWord) ? 1 : 0,
	}, phoneticToken.length > 0 ? phoneticToken : null);
}

// Japanese token regrouping can merge one of the entries above back into a
// single token. Re-tokenize each replacement only to obtain its reading, then
// collapse it to the configured annotation boundary.
export async function resplitKnownTokens(tokens: AnnotatedToken[]): Promise<AnnotatedToken[]> {
	const tokenGroups = await Promise.all(tokens.map(async (token) => {
		const splitTokens = tokenSplits[token.text];
		if (!splitTokens) return [token];

		const splitTokenGroups = await Promise.all(splitTokens.map(tokenizeAndSpellWithKuroshiro));
		return splitTokenGroups.map(collapseAnnotatedTokens);
	}));

	return tokenGroups.flat();
}

function jaTokenToPhoneticToken(jaToken: any): PhoneticToken { // kuroshiroToken
	// NOTE: Previous code (lingoprocessor-v10) seemingly shows phonetics regardless of if it was a word or not.
	// Not sure if there was an explicit reason why I had it like that previously.

	// Keep emoji intact.
	if (regexEmoji.test(jaToken.surfaceForm)) return [[jaToken.surfaceForm, jaToken.surfaceForm]];

	// Brute Multi-Token Spelling Override
	if (jaToken.surfaceForm === "緑色") return [["緑", "みどり"], ["色", "いろ"]];

	// Normal Kuroshiro point-based spelling.
	if (jaToken.points?.length > 0) {
		return jaToken.points.map((point: any) => [
			point.surfaceForm,
			spellingOverrides[point.surfaceForm] ?? point.hiragana,
		]);
	}

	// Fallback, in case Kuroshiro gives no points.
	return [[
		jaToken.surfaceForm,
		spellingOverrides[jaToken.surfaceForm] ?? jaToken.surfaceForm,
	]];
}

export async function spellTokens(tokens: AnnotatedToken[]): Promise<AnnotatedToken[]> { // Only used by JA-LLM-Glosser which is not currently in use - 20260609
	await ensureKuroshiroInitialized();

	return Promise.all(
		tokens.map(async (token) => {
			// Keep non-word tokens as-is.
			if (!token.isWord) return { ...token };

			// Whole-token override takes priority.
			if (spellingOverrides[token.text]) {
				return withPhoneticToken(token, [[token.text, spellingOverrides[token.text]]]);
			}

			// Emoji fallback.
			if (regexEmoji.test(token.text)) {
				return withPhoneticToken(token, [[token.text, token.text]]);
			}

			const ja_analysis = await kuroshiro.convert(token.text, {
				mode: "furigana",
				to: "hiragana",
			});

			const phoneticToken: PhoneticToken = ja_analysis.tokens.flatMap((jaToken: any) =>
				jaTokenToPhoneticToken(jaToken)
			);

			return withPhoneticToken(token, phoneticToken.length > 0 ? phoneticToken : null);
		})
	);
}
