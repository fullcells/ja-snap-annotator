// JMdict → house gloss style. Deterministic conversion of a JMdict (jmdict-simplified) entry's English into one short
// learner gloss in the style of the words2 rows: "answer", "fare", "police box", "license", "medium size".
//
// JMdict style                                          house style
// many senses, most common first                        one sense: the first that applies to this spelling and
//   ("(1) normal; ordinary (2) normally; usually")        reading and is in current use (not archaic, obsolete, rare,
//                                                          dated or historical), and not a particle, auxiliary
//                                                          or prefix
// several glosses per sense ("license; licence;          one gloss: the first plain one of at most four words, else
//   permission; permit")                                   the first plain one. Explanations ("used to emphasize …",
//                                                          "indicates …") are not glosses; a sense with nothing else
//                                                          gives way to the next sense
// bracketed notes ("(passenger) fare", "departure       no brackets: "fare", "departure", "transfer"
//   (of a train, car, etc.)", "transfer (trains, …)")     (kept only if nothing else is left)
// verbs with "to" ("to answer", "to go")                 verbs without it: "answer", "go"
// occasional leading article ("a sample")                 none: "sample"
// prefixes and suffixes ("pseudo-", "-ian")               not glossed: the sense gives way to the next one
// trailing punctuation ("Mr.", "etc.")                    dropped, except an abbreviation's full stop ("Mr.")
// casing as written (mostly lowercase; names and         unchanged
//   eras capitalised: "Heisei era")
//
// Used by scripts/import-jmdict-glosses.mjs at import time only; the shipped data holds the converted glosses.

/** Senses not in current use, skipped when choosing a gloss. */
export const SKIPPED_MISC = new Set(['arch', 'obs', 'rare', 'obsc', 'dated', 'hist']);
/** Function-word parts of speech, and prefixes: never glossed from JMdict (the house notation glosses particles: を ⤺, は :). */
const FUNCTION_POS = /^(prt|aux|aux-v|aux-adj|cop|conj|pref)$/;
/** Verb classes: their glosses drop "to". */
const VERB_POS = /^v(1|2|4|5|k|z|n|r|s-[isc]|-unspec)/;

const applies = (list, value) => list.includes('*') || list.includes(value);
const words = text => text.split(/\s+/).filter(Boolean).length;
/** Glosses that describe usage rather than translate (JMdict often leaves these untyped). */
const EXPLANATORY = /^(used (to|as|for|in|when|after|before|with)|indicates?|expresses|denotes|emphasi[sz]es|after a|at the end of|refers? to)\b/i;
/** Abbreviations that keep their full stop. */
const ABBREVIATION = /\b(Mr|Mrs|Ms|Dr|St|Mt|etc|approx|esp|incl|e\.g|i\.e)\.$/i;

/** One gloss text in house style; null when nothing usable is left. */
export function houseGloss(text, partOfSpeech = []) {
	let g = String(text).replace(/\s*\([^()]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();   // bracketed notes
	if (!g) g = String(text).replace(/[()]/g, '').replace(/\s+/g, ' ').trim();           // only brackets: keep their words
	if (partOfSpeech.some(p => VERB_POS.test(p))) g = g.replace(/^to (?=\S)/i, '');       // "to answer" → "answer"
	g = g.replace(/^(a|an|the) (?=\S)/i, '').trim();                                     // leading article
	if (!ABBREVIATION.test(g)) g = g.replace(/[.;,:]+$/, '').trim();                       // trailing marks, not "Mr."
	return g && !EXPLANATORY.test(g) && !/^-|-$/.test(g) ? g : null;                     // no explanations or affixes
}

/** The senses that may be glossed for this spelling (kanji, or null for a kana-only word) and reading, in JMdict order. */
export function usableSenses(entry, kanji, kana) {
	return entry.sense.filter(s =>
		(kanji == null || applies(s.appliesToKanji, kanji)) && applies(s.appliesToKana, kana)
		&& !s.misc.some(m => SKIPPED_MISC.has(m)) && !s.partOfSpeech.every(p => FUNCTION_POS.test(p)));
}

/** The house gloss of an entry for a spelling and reading: from its first usable sense that has a plain gloss, or null. */
export function entryGloss(entry, kanji, kana) {
	for (const sense of usableSenses(entry, kanji, kana)) {
		const candidates = sense.gloss.filter(g => g.lang === 'eng' && g.type !== 'explanation')
			.map(g => houseGloss(g.text, sense.partOfSpeech)).filter(Boolean);
		const gloss = candidates.find(g => words(g) <= 4) ?? candidates[0];
		if (gloss) return gloss;
	}
	return null;
}
