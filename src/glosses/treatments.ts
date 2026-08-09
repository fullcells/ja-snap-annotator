import japaneseGlossOverrides from './overrides';
import type { AnnotatedToken } from '../types';

// Apply all deterministic/offline Japanese gloss knowledge. Unknown glosses are
// intentionally left as null so an online wrapper can fill them later. Calling
// this again after online glossing is safe and also cleans generated glosses.
export function applyJapaneseGlossTreatments(annotatedTokens: AnnotatedToken[]): AnnotatedToken[] {
	const tokens = annotatedTokens.map(token => ({
		...token,
		gloss: japaneseGlossOverrides[token.text.toLowerCase()] ?? token.gloss ?? null,
	}));
	const text = tokens.map(token => token.text).join('');

	// TRANSLATION FIX: Gloss ends with "…-TE" => Remove the "-TE".
	tokens.filter(token => token.gloss?.endsWith("-TE") && token.gloss.length > 3).forEach(token => {
		token.gloss = token.gloss.replace(/-TE$/, "");
	});
	// TRANSLATION FIX: Remove "it " from e.g. "it was hot".
	tokens.filter(token => token.gloss?.toLowerCase()?.startsWith("it ") && token.gloss.split(" ").length > 2).forEach(token => {
		token.gloss = token.gloss.replace(/^it /i, "");
	});
	// FROM ML TRANSLATION: LITERARY-GLOSS-ALIGNMENT: "was hot" => "hot was".
	tokens.filter(
		token => token.gloss?.toLowerCase()?.startsWith("was ") && token.gloss.split(" ").length > 1 && !token.gloss.endsWith("?"),
	).forEach(token => {
		token.gloss = (token.gloss.toLowerCase().replace(/^was\s+/i, "") + " was").trim();
	});
	// FROM ML TRANSLATION: LITERARY-GLOSS-ALIGNMENT: move "let's" to the back.
	tokens.filter(
		token => token.gloss?.toLowerCase().startsWith("let's ") && token.gloss.split(" ").length > 1 && !token.gloss.endsWith("?"),
	).forEach(token => {
		token.gloss = (token.gloss.replace(/^let's\s+/i, "") + " let's").trim();
	});

	// して - do / wear (accessory)
	if (tokens.some(token => token.text === "して")) {
		if (["首輪","ジーンズ","腕時計","メガネ","ネックレス","イヤリング","指輪","手袋","マフラー"].some(clothing => text.includes(clothing))) {
			tokens.filter(token => token.text === "して").forEach(token => (token.gloss = "wear (accessory)"));
		}
	}

	if (tokens.some(token => token.text === "猫")) {
		if (tokens.some(token => token.text === "ひげ")) {
			tokens.filter(token => token.text === "ひげ").forEach(token => (token.gloss = "whiskers"));
		} else {
			tokens.filter(token => token.text === "ひげ").forEach(token => (token.gloss = "beard"));
		}
	}

	// 高い - high / expensive
	if (tokens.some(token => token.text === "高い")) {
		const gloss = ["店","安い","安"].some(shopWord => text.includes(shopWord)) ? "expensive" : "high";
		tokens.filter(token => token.text === "高い").forEach(token => (token.gloss = gloss));
	}

	// また - again / also
	if (tokens.some(token => token.text === "また")) {
		tokens.forEach((token, index) => {
			if (token.text !== "また") return;
			token.gloss = !tokens[index - 1]?.isWord ? "also" : "again";
		});
	}

	// と + 言/…
	if (tokens.some(token => token.text === "と")) {
		tokens.forEach((token, index) => {
			if (token.text !== "と") return;
			const previousToken = tokens[index - 1];
			const nextToken = tokens[index + 1];
			if (["、",",","。"].includes(nextToken?.text)) {
				if (["ます","ました","ません","る","た","て","で","ない","ている","ています","ていた","ていました","たい"].some(likelyVerbTail => previousToken?.text?.endsWith(likelyVerbTail))) { // Future: Replace this with knowing if the actual previous token was a Verb or not from Kuromoji.
					token.gloss = "when";
				}
			}
			if (["」"].some(quoteChar => previousToken?.text?.includes(quoteChar))) token.gloss = "❞";
			if (["言","思","話","聞"].some(specialVerb => nextToken?.text?.includes(specialVerb))) token.gloss = "❞"; // ~ 話 // ~+ ["遊","結婚"] <- played-with/married-to <- comitative rather than quotative // LLM Recommendation; check left is a verb first (may need to skip a token, in case there are particles before the verb)
		});
	}

	// […ん,で]
	if (tokens.some(token => token.text === "で")) {
		tokens.forEach((token, index) => {
			if (token.text !== "で") return;
			if (tokens[index - 1]?.text.endsWith("ん")) token.gloss = "⤔"; // i.e. this is the 'te' form, rather than "in"
		});
	}

	// [には] <- so rare, i'm opting to remove it actually, and instead do the opposite; treat [に,は] when it means 'に' "regarding it" instead
	// if (tokens.some(token => token.text === "には")) {
	// 	tokens.forEach((token, index) => {
	// 		if (token.text !== "には") return;
	// 		const previousToken = tokens[index - 1];
	// 		if (["上","下","図書館","家","中","公園","ここ","左","側","右"].some(quoteChar => previousToken?.text?.includes(quoteChar))) token.gloss = "at :"; // prob better to do the inverse actually - since there's SO MANY Cases for this
	// 	});
	// }

	// NUMBERS/COUNTERS
	const japaneseNumberPattern = /^[0-9０-９〇零一二三四五六七八九十百千万億兆壱弐参拾]+$/;
	const normalizeFullWidthDigits = (value: string): string =>
		value.replace(/[０-９]/g, character => String.fromCharCode(character.charCodeAt(0) - 0xFEE0));
	const isOneNumber = (value: string): boolean => {
		const normalized = normalizeFullWidthDigits(value);
		// Arabic numerals: 1, 01, １, ０１, etc.
		if (/^[0-9]+$/.test(normalized)) return Number(normalized) === 1;
		// Kanji numerals: only exact "one" should be singular.
		return /^(一|壱)$/.test(value);
	};
	const applyNumberCounterGloss = (counterText: string, singularGloss: string, pluralGloss: string): void => {
		tokens.forEach((token, index) => {
			if (token.text !== counterText || index === 0) return;
			const previousToken = tokens[index - 1];
			if (previousToken.text === "何") {
				if (counterText !== "時") { // skip "何時"
					// "何時間", "何歳", "何本" => "how many hours", etc.
					previousToken.gloss = "how many";
					token.gloss = pluralGloss;
				}
			} else if (japaneseNumberPattern.test(previousToken.text)) {
				token.gloss = isOneNumber(previousToken.text) ? singularGloss : pluralGloss;
			}
		});
	};
	const counterGlosses: Array<[string, string, string]> = [
		["時間", "hour", "hours"],
		["歳", "year old", "years old"],
		["本", "(long)", "(long)"],

		// Below are LLM-generated and haven't popped up yet - so only carefully enabling them.
		["人", "(person)", "(people)"],
		["個", "(item)", "(items)"],
		["杯", "(cup)", "(cups)"],
		["枚", "(flat)", "(flat)"],
		["つ", "(thing)", "(things)"],
		["匹", "(animal)", "(animals)"],
		["羽", "(bird)", "(birds)"],
		["冊", "(book)", "(books)"],
		["時", "o'clock", "o'clock"],

		// ["頭", "large animal", "large animals"],
		// ["台", "machine", "machines"],
		// ["回", "time", "times"],
		// ["度", "time/degree", "times/degrees"],
		// ["階", "floor", "floors"],
		// ["軒", "building", "buildings"],
		// ["件", "case", "cases"],
		// ["泊", "night", "nights"],
		// ["着", "piece of clothing", "pieces of clothing"],
		// ["足", "pair", "pairs"],
		// ["円", "yen", "yen"],
		// ["秒", "second", "seconds"],
		// ["分", "minute", "minutes"],
		// ["日", "day", "days"],
		// ["週間", "week", "weeks"],
		// ["ヶ月", "month", "months"],
		// ["か月", "month", "months"],
		// ["カ月", "month", "months"],
		// ["年", "year", "years"],
	];
	counterGlosses.forEach(([counter, singular, plural]) => {
		applyNumberCounterGloss(counter, singular, plural);
	});

	return tokens;
}
