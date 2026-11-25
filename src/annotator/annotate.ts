import { spellingOverrides } from "../treatments/spelling-overrides";
import { resolveJapaneseReadings } from '../readings/resolve-japanese-readings';
import MyKuroshiro from "../tokenization/my-kuroshiro/core.js";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";
import { mergeJapaneseTeForms } from '../treatments/token-treatments';
// Numbers and counters (readings by the number's last digit, dates, times, weekdays, counting glosses).
import { applyJapaneseNumberTokens, applyJapaneseNumberReadings, applyJapaneseCounterGlosses } from '../treatments/numbers';
// 〇 / × as marks (まる circle, ばつ cross) outside arithmetic and numerals.
import { applyJapaneseMarks } from '../treatments/marks';
import { applyJapaneseContextReadings } from '../readings/context-readings';
import { applyJapaneseGlossTreatments } from '../glosses/treatments';
import { applyJapaneseContextGlosses } from '../glosses/context-glosses';
import {
	applyJapaneseSBWordsGlosses,
	getSnapshotJapaneseSBWords,
	japaneseSBWordsGlossLookup,
	japaneseSBWordsHasRow,
} from '../snapshot/japanese-sb-words';
import { applyJapaneseBaseFormGlosses } from '../glosses/base-form';
import { morphemeSpans, type JapaneseMorpheme } from '../shared/morphemes';
import { precipitationBefore } from '../shared/weather';
import { applyJapaneseJmdictGlosses, isJapaneseJmdictWord } from '../glosses/jmdict';
import { mergeJapaneseDictionaryWords } from '../treatments/dictionary-merges';
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
		if (isDecimalPoint) is_word = true;

		// DETERMINE PHONETICTOKEN
		const annotatedToken: AnnotatedToken = {
			text: jaToken.surfaceForm,
			isWord: is_word ? 1 : 0,
		};

		if (isDecimalPoint) return withPhoneticToken(annotatedToken, [['.', 'てん']]);
		if (symbolSpelling) return withPhoneticToken(annotatedToken, [[jaToken.surfaceForm, symbolSpelling]]);

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

/** Preserve context-specific verb senses after a caller has applied generic dictionary glosses. */
export async function applyJapaneseContextVerbGlosses(tokens: AnnotatedToken[], morphemes?: JapaneseMorpheme[]): Promise<AnnotatedToken[]> {
	let textPosition = 0;
	let weatherMorphemes: JapaneseMorpheme[] | undefined = morphemes;
	let weatherSpans: ReturnType<typeof morphemeSpans> | undefined;
	const result: AnnotatedToken[] = [];
	for (const [index, token] of tokens.entries()) {
		let gloss: string | undefined;
		if (token.text === '降り' || token.text === '降って') {
			if (!weatherMorphemes) {
				await ensureKuroshiroInitialized();
				const parsed: JapaneseMorpheme[] = await kuroshiro._analyzer.parse(tokens.map(part => part.text).join(''));
				weatherMorphemes = parsed;
			}
			weatherSpans ??= morphemeSpans(weatherMorphemes);
			const morphemeIndex = weatherSpans.findIndex(morpheme => morpheme.start === textPosition);
			gloss = precipitationBefore(weatherMorphemes, morphemeIndex);
		}
		if (tokens[index - 1]?.text === 'を') {
			const object = tokens[index - 2]?.text;
			if (token.text === '撮り' && object === '写真') gloss = 'take';
			if (token.text === '塗って' && (object === 'バター' || object === 'ジャム')) gloss = 'spread';
		}
		result.push(gloss ? { ...token, gloss } : token);
		textPosition += token.text.length;
	}
	return result;
}

// Complete offline-first Japanese annotation. The bundled JapaneseSBWords are
// usable without a connection; browser clients refresh them locally in the
// background. Words words2 lacks fall back to JMdict's English; only words neither knows keep a null gloss.
export async function annotate(text: string, options: JapaneseAnnotateOptions = {}): Promise<AnnotatedToken[]> {
	// Tokenize And Spell
	let tokens = await tokenizeAndSpellWithKuroshiro(text);
	const japaneseSBWords = options.latestSBWords ?? await getSnapshotJapaneseSBWords();
	const words2Gloss = japaneseSBWordsGlossLookup(japaneseSBWords);
	// Kuromoji's analysis of the whole text: parts of speech for merging, base forms for the gloss fallbacks.
	const morphemes: JapaneseMorpheme[] = await kuroshiro._analyzer.parse(text);
	tokens = mergeJapaneseTeForms(tokens, morphemes);
	// Join pieces whose joined text is a known unit: a words2 row or a JMdict noun (あり + ます, 背 + が + 高い, 路面 + 電車,
	// のり + ば). This replaced the hand-written regroup list ("BRUTE MERGE").
	const isOneMorpheme = (word: string) => kuroshiro._analyzer._analyzer.tokenize(word).length === 1; // Kuromoji's own reading
	tokens = mergeJapaneseDictionaryWords(tokens, text, morphemes, word => words2Gloss(word) !== null, japaneseSBWordsHasRow(japaneseSBWords), isJapaneseJmdictWord, isOneMorpheme);
	tokens = await resplitKnownTokens(tokens);
	tokens = applyJapaneseNumberTokens(tokens);
	tokens = resolveJapaneseReadings(tokens);
	// Counting readings come after dictionary resolution, so 4時 is よじ and 3日間 みっかかん whatever the dictionary says.
	tokens = applyJapaneseNumberReadings(tokens);
	// Readings by context (Kuromoji's parts of speech): 間 on its own is あいだ (between); 〜間 keeps かん.
	tokens = applyJapaneseContextReadings(tokens, text, morphemes);
	tokens = applyJapaneseMarks(tokens);
	// Glossify
	tokens = applyJapaneseSBWordsGlosses(tokens, japaneseSBWords);
	// Fallback: an inflected word words2 has no row for takes its dictionary form's row (internal base form from
	// Kuromoji), splitting off negative / desire endings so their meaning stays visible.
	tokens = applyJapaneseBaseFormGlosses(tokens, text, morphemes, words2Gloss);
	// Fallback: a content word words2 still has no gloss for takes its JMdict gloss (offline, imported in house style),
	// chosen by spelling and resolved reading; inflected words by their dictionary form.
	tokens = applyJapaneseJmdictGlosses(tokens, text, morphemes, words2Gloss);
	// Apply deterministic/context-aware overrides last so they remain stronger
	// than a generic JapaneseSBWords match.
	tokens = applyJapaneseGlossTreatments(tokens);
	// Grammatical context (Kuromoji's parts of speech and dictionary forms): に, と, でも by their verb or question word, and a
	// few words by their neighbours (人に聞く ask, よく知らない well, 旅行中 during). Only on explicit evidence.
	tokens = applyJapaneseContextGlosses(tokens, morphemes);
	tokens = await applyJapaneseContextVerbGlosses(tokens, morphemes);
	// A counter after a number means its counting sense (円 yen, 月 month), stronger than the snapshot's noun gloss.
	tokens = applyJapaneseCounterGlosses(tokens);
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

	const spelled = await Promise.all(
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
	return resolveJapaneseReadings(spelled);
}
