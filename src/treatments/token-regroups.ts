// Japanese token boundaries that should be restored after Kuromoji tokenization.
// Keys/values were historically kept in the general LANG_TOKEN_REGROUPS table.
// aka BRUTE MERGE
//
// Being retired: units now come from data. Dictionary-guided merging (src/treatments/dictionary-merges.ts) joins
// words2 rows and JMdict nouns, and the numbers treatment (src/treatments/numbers.ts) joins kanji numerals and
// question counters (十 + 一, 何 + 回). What is left needs a words2 change first (TODO.md, "Retire the regroup list"):
const japaneseTokenRegroups: string[] = [
	// Phrases that start or end with a particle. words2 has rows for them, but also for phrases that are not units
	// (私は, 前に, の隣に), so merging does not yet trust words2 rows with a particle at either end.
	// (Order matters where two overlap: 間に before の間, so の + 間に as before.)
	"とは", "ではありません", "じゃない", "間に", "のうち", "よりも", "ことも", "ことが", "誰か", "の上", "の下", "の間", "上に",
	"下に", "ように", "のか", "またね", "かもしれない", "どれくらい", "に対して支払う",
	// Merged across て before the te-form merge takes it (食べ + て + しまい + ます)
	"てしまいます",
	// No words2 row yet
	"魔水", "くした", "早く起きる", "気をつけて", "お腹がすいた", "お腹がすい", "喉が渇い", "歳をとった", "歳を取った",
	"疲れていて", "ワクワクしてます", "おらず", "具合が悪そう", "ほしがり",
	// "には" stays two tokens (に + は), so the gloss on に can change when it means "regarding it"
];

export default japaneseTokenRegroups;
