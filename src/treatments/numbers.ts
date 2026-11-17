// Numbers and counters: readings and glosses for a number (Arabic digits, or 何) followed by a counter, plus dates,
// times, weekday abbreviations and comma-grouped numbers. Deterministic and offline.
//
// One rule set instead of per-number exceptions: a counter's reading follows the number's LAST digit (and multiples of
// ten, a hundred, a thousand), with the standard sound changes (いっぷん, さんぼん, ろっかい, はっさい, じゅっぷん, なんぷん).
// Dates and days have their own native readings (ついたち, ふつか … とおか, はつか). Glosses give a counter its counting
// sense (円 yen, 月 month, 番線 platform, 目 -th) instead of the noun's (circle, moon, wire, eye).
//
// applyJapaneseNumberTokens  joins/splits tokens (21,300 → one number; 分の → 分 + の after a number), before readings
// applyJapaneseNumberReadings  sets readings; run after dictionary reading resolution so the counting reading wins
// applyJapaneseCounterGlosses  sets counting glosses; run after the snapshot and gloss treatments so it wins there too
import type { AnnotatedToken, PhoneticToken } from '../types';

const DIGIT = ['', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'];
const HUNDRED: Record<number, string> = { 1: 'ひゃく', 3: 'さんびゃく', 6: 'ろっぴゃく', 8: 'はっぴゃく' };
const THOUSAND: Record<number, string> = { 1: 'せん', 3: 'さんぜん', 8: 'はっせん' };
const LARGE = ['', 'まん', 'おく', 'ちょう'];

/** ASCII or full-width digits as an integer (leading zeros and comma groups allowed), else null. */
export function parseJapaneseNumber(text: string | undefined): number | null {
	if (!text) return null;
	const ascii = text.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
	if (!/^\d{1,16}$/.test(ascii) && !/^\d{1,3}(?:,\d{3})+$/.test(ascii)) return null; // 130, 04, 21,300
	return Number(ascii.replace(/,/g, ''));
}
const isNumberText = (text: string | undefined) => parseJapaneseNumber(text) !== null;
const hasLeadingZero = (text: string) => /^[0０][0-9０-９]/.test(text);

/** A number in kana, as it is read on its own: 21300 → にまんせんさんびゃく. */
export function japaneseNumberReading(n: number): string {
	if (n === 0) return 'ゼロ';
	const groups: number[] = [];
	for (let rest = n; rest > 0; rest = Math.floor(rest / 10000)) groups.push(rest % 10000);
	if (groups.length > LARGE.length) return String(n);
	return groups.map((group, index) => {
		if (!group) return '';
		const th = Math.floor(group / 1000), hu = Math.floor(group / 100) % 10, te = Math.floor(group / 10) % 10, on = group % 10;
		const four = (th ? THOUSAND[th] ?? DIGIT[th] + 'せん' : '') + (hu ? HUNDRED[hu] ?? DIGIT[hu] + 'ひゃく' : '')
			+ (te ? (te === 1 ? '' : DIGIT[te]) + 'じゅう' : '') + (on ? DIGIT[on] : '');
		// 1万 いちまん, 1億 いちおく, 1兆 いっちょう
		const unit = LARGE[index];
		const head = index === 3 && four.endsWith('いち') ? four.slice(0, -2) + 'いっ' : four;
		return head + unit;
	}).reverse().join('');
}

// The last mora of a number's reading before a counter that doubles its first consonant (いち → いっ, じゅう → じゅっ,
// さんびゃく → さんびゃっ). `endings` says which of these a counter doubles (k-sounds also double ろく).
type Ending = 'いち' | 'ろく' | 'はち' | 'じゅう' | 'ひゃく';
const DOUBLED: [Ending, string, string][] = [
	['いち', 'いち', 'いっ'], ['ろく', 'ろく', 'ろっ'], ['はち', 'はち', 'はっ'], ['じゅう', 'じゅう', 'じゅっ'],
	['ひゃく', 'ひゃく', 'ひゃっ'], ['ひゃく', 'びゃく', 'びゃっ'], ['ひゃく', 'ぴゃく', 'ぴゃっ'],
];
const ALL_ENDINGS: Ending[] = ['いち', 'ろく', 'はち', 'じゅう', 'ひゃく'];
const geminate = (reading: string, endings: Ending[]): string | null => {
	for (const [kind, end, doubled] of DOUBLED) if (endings.includes(kind) && reading.endsWith(end)) return reading.slice(0, -end.length) + doubled;
	return null;
};

type Reading = { number: string; counter: string };
type CounterRule = (n: number | 'nan', base: string) => Reading;

// h-row counters: ふん/ほん/ひき/はい… After 1, 6, 8, 10, 100: doubled + p (いっぷん, ろっぽん). After 3 and 何: b (さんぼん),
// except 分 (さんぷん). 分 also takes p after 4 (よんぷん). 1000: b for ほん/ひき/はい (せんぼん), p for 分 (せんぷん).
function hCounter(h: string, p: string, b: string, { fourP = false } = {}): CounterRule {
	return (n, base) => {
		if (n === 'nan') return { number: 'なん', counter: b };
		const last = n % 10;
		const doubled = geminate(base, ALL_ENDINGS);
		if (last === 0 && n % 1000 === 0) return { number: base, counter: b };
		if (doubled && (last === 1 || last === 6 || last === 8 || last === 0)) return { number: doubled, counter: p };
		if (last === 3) return { number: base, counter: b };
		if (last === 4 && fourP) return { number: base, counter: p };
		return { number: base, counter: h };
	};
}
// k/s/t-row counters: かい/こ/さい/さつ… After 1, 8, 10, 100 (and 6 for k-sounds): doubled (いっかい, はっさい, ろっこ).
// Some voice after 3 and 何 (さんがい, さんぞく).
function kCounter(k: string, { six = false, voiced = '' } = {}): CounterRule {
	return (n, base) => {
		if (n === 'nan') return { number: 'なん', counter: voiced || k };
		const last = n % 10;
		const doubled = geminate(base, six ? ALL_ENDINGS : ['いち', 'はち', 'じゅう', 'ひゃく']);
		if (doubled && [1, 6, 8, 0].includes(last)) return { number: doubled, counter: k };
		if (last === 3 && voiced) return { number: base, counter: voiced };
		return { number: base, counter: k };
	};
}
// Counters read after the plain number, with the number's own exceptions (4 → よ, 7 → しち, 9 → く).
function plainCounter(counter: string, exceptions: Record<number, string> = {}, nan = 'なん'): CounterRule {
	return (n, base) => n === 'nan' ? { number: nan, counter } : { number: exceptions[n] ?? exceptionByLastDigit(n, base, exceptions), counter };
}
// 14 → じゅうよ, 24 → にじゅうよ: an exception for a digit also applies when it is the last digit (not for 0).
function exceptionByLastDigit(n: number, base: string, exceptions: Record<number, string>): string {
	const last = n % 10;
	if (n > 10 && last && exceptions[last] && Math.floor(n / 10) % 10 !== 0) return japaneseNumberReading(n - last) + exceptions[last];
	return base;
}
// Days of the month and counts of days: native readings for 1–10, 14, 20, 24; otherwise ～にち (17 じゅうしち, 19 じゅうく).
const DAYS: Record<number, [string, string]> = {
	1: ['つい', 'たち'], 2: ['ふつ', 'か'], 3: ['みっ', 'か'], 4: ['よっ', 'か'], 5: ['いつ', 'か'], 6: ['むい', 'か'], 7: ['なの', 'か'],
	8: ['よう', 'か'], 9: ['ここの', 'か'], 10: ['とお', 'か'], 14: ['じゅうよっ', 'か'], 20: ['はつ', 'か'], 24: ['にじゅうよっ', 'か'],
};
const dayRule = (suffix = ''): CounterRule => (n, base) => {
	if (n === 'nan') return { number: 'なん', counter: 'にち' + suffix };
	const native = DAYS[n];
	// one day (a duration) is いちにち; the first of a month is ついたち (decided by the caller, see isDateContext)
	if (native && !(n === 1 && suffix)) return { number: native[0], counter: native[1] + suffix };
	return { number: exceptionByLastDigit(n, base, { 7: 'しち', 9: 'く' }), counter: 'にち' + suffix };
};

/** Counters and how a preceding number (or 何) is read with them. */
export const JAPANESE_COUNTERS: Record<string, CounterRule> = {
	'分': hCounter('ふん', 'ぷん', 'ぷん', { fourP: true }),
	'本': hCounter('ほん', 'ぽん', 'ぼん'),
	'匹': hCounter('ひき', 'ぴき', 'びき'),
	'杯': hCounter('はい', 'ぱい', 'ばい'),
	'泊': hCounter('はく', 'ぱく', 'ぱく'),
	'品': hCounter('ひん', 'ぴん', 'ぴん'),
	'回': kCounter('かい', { six: true }),
	'個': kCounter('こ', { six: true }),
	'階': kCounter('かい', { six: true, voiced: 'がい' }),
	'件': kCounter('けん', { six: true }),
	'軒': kCounter('けん', { six: true, voiced: 'げん' }),
	'曲': kCounter('きょく', { six: true }),
	'歳': kCounter('さい'),
	'才': kCounter('さい'),
	'冊': kCounter('さつ'),
	'週': kCounter('しゅう'),
	'足': kCounter('そく', { voiced: 'ぞく' }),
	'着': kCounter('ちゃく'),
	'通': kCounter('つう'),
	'頭': kCounter('とう'),
	'点': kCounter('てん'),
	// 1 ひとり, 2 ふたり, 4 よにん, 7 しちにん (ななにん is also heard), 14 じゅうよにん
	'人': (n, base) => n === 1 ? { number: 'ひと', counter: 'り' } : n === 2 ? { number: 'ふた', counter: 'り' } : plainCounter('にん', { 4: 'よ', 7: 'しち' })(n, base),
	'つ': (n, base) => {
		const native: Record<number, string> = { 1: 'ひと', 2: 'ふた', 3: 'みっ', 4: 'よっ', 5: 'いつ', 6: 'むっ', 7: 'なな', 8: 'やっ', 9: 'ここの' };
		if (n === 'nan') return { number: 'いく', counter: 'つ' };
		return native[n] ? { number: native[n], counter: 'つ' } : { number: base, counter: 'つ' };
	},
	'月': plainCounter('がつ', { 4: 'し', 7: 'しち', 9: 'く' }),
	'日': dayRule(),
	'日間': dayRule('かん'),
	'時': plainCounter('じ', { 4: 'よ', 7: 'しち', 9: 'く' }),
	'時間': plainCounter('じかん', { 4: 'よ', 7: 'しち', 9: 'く' }),
	'年': plainCounter('ねん', { 4: 'よ' }),
	'円': plainCounter('えん', { 4: 'よ' }),
	'番': plainCounter('ばん'),
	'番線': plainCounter('ばんせん'),
	'番目': plainCounter('ばんめ'),
	'号': plainCounter('ごう'),
	'号車': plainCounter('ごうしゃ'),
	'番地': plainCounter('ばんち'),
	'丁目': (n, base) => n === 'nan' ? { number: 'なん', counter: 'ちょうめ' } : { number: geminate(base, ['いち', 'はち', 'じゅう']) ?? base, counter: 'ちょうめ' },
};

// Counting senses, where the noun on its own means something else: after a number (or 何) 円 is yen, not a circle;
// 月 a month, not the moon; 番線 a platform. Counters whose snapshot gloss already counts (人 (people), 回 times,
// 歳 years old, 分 minute) are left as they are.
export const JAPANESE_COUNTER_GLOSSES: Record<string, string> = {
	'円': 'yen', '月': 'month', '日': 'day', '日間': 'days', '時': "o'clock", '時間': 'hours',
	'番線': 'platform', '番': 'number', '号': 'number', '号車': 'car (number)', '番目': '-th',
};
// 何 + counter as one word (Kuromoji's 何分 なにぶん "anyway", 何時 いつ): the counting reading and sense.
const QUESTION_COUNTERS: Record<string, { reading: [string, string][]; gloss: string }> = {
	'何分': { reading: [['何', 'なん'], ['分', 'ぷん']], gloss: 'how many minutes' },
	'何時': { reading: [['何', 'なん'], ['時', 'じ']], gloss: 'what time' },
	'何日': { reading: [['何', 'なん'], ['日', 'にち']], gloss: 'what day' },
	'何月': { reading: [['何', 'なん'], ['月', 'がつ']], gloss: 'what month' },
	'何人': { reading: [['何', 'なん'], ['人', 'にん']], gloss: 'how many people' },
	'何回': { reading: [['何', 'なん'], ['回', 'かい']], gloss: 'how many times' },
	'何番線': { reading: [['何', 'なん'], ['番', 'ばん'], ['線', 'せん']], gloss: 'which platform' },
};

// Weekdays written as one character: in a range or list (月〜金, 土・日) or after a date (14日（金）).
const WEEKDAYS: Record<string, [string, string]> = {
	'月': ['げつ', 'Mon'], '火': ['か', 'Tue'], '水': ['すい', 'Wed'], '木': ['もく', 'Thu'], '金': ['きん', 'Fri'], '土': ['ど', 'Sat'], '日': ['にち', 'Sun'],
};
const RANGE = /^[〜～~・、,・\-－]$/, OPEN = /^[（(]$/, CLOSE = /^[）)]$/;
function isWeekday(tokens: AnnotatedToken[], i: number): boolean {
	const t = tokens[i];
	if (!WEEKDAYS[t.text]) return false;
	const at = (k: number) => tokens[i + k]?.text;
	if (RANGE.test(at(-1) ?? '') && WEEKDAYS[at(-2) ?? ''] && !isNumberText(at(-3))) return true;
	if (RANGE.test(at(1) ?? '') && WEEKDAYS[at(2) ?? ''] && !isNumberText(at(-1))) return true;
	// (金) after a date: 14日（金）
	if (OPEN.test(at(-1) ?? '') && CLOSE.test(at(1) ?? '') && (at(-2) === '日' || isNumberText(at(-2)))) return true;
	return false;
}
// "1日" is the first of a month (ついたち) when a month comes before it or a weekday after it; otherwise one day (いちにち).
function isDateContext(tokens: AnnotatedToken[], i: number): boolean {
	for (let k = i - 1; k >= Math.max(0, i - 3); k--) if (tokens[k].text === '月' && isNumberText(tokens[k - 1]?.text)) return true;
	return OPEN.test(tokens[i + 1]?.text ?? '') && !!WEEKDAYS[tokens[i + 2]?.text ?? ''];
}

const phonetic = (text: string, reading: string): PhoneticToken => [[text, reading]];

/** Token boundaries for numbers: join comma-grouped numbers (21,300) into one; after a number, split 分の into 分 + の
    and 日生 (a date of birth) into 日 + 生. */
export function applyJapaneseNumberTokens(tokens: AnnotatedToken[]): AnnotatedToken[] {
	const out: AnnotatedToken[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		// 21 , 300 (, 000 …) → 21,300
		if (/^\d{1,3}$/.test(t.text) && tokens[i + 1]?.text === ',' && /^\d{3}$/.test(tokens[i + 2]?.text ?? '')) {
			let text = t.text, j = i;
			while (tokens[j + 1]?.text === ',' && /^\d{3}$/.test(tokens[j + 2]?.text ?? '')) { text += ',' + tokens[j + 2].text; j += 2; }
			const n = Number(text.replace(/,/g, ''));
			out.push({ text, isWord: 1, phoneticToken: phonetic(text, japaneseNumberReading(n)), gloss: text });
			i = j;
			continue;
		}
		// 01日生 (born on the 1st): Kuromoji reads 日生 as one word (にっせい); a date is 日 + 生(まれ)
		if (t.text === '日生' && isNumberText(out.at(-1)?.text)) {
			out.push({ text: '日', isWord: 1, phoneticToken: phonetic('日', 'にち') }, { text: '生', isWord: 1, phoneticToken: phonetic('生', 'うまれ'), gloss: 'born' });
			continue;
		}
		if (t.text === '分の' && isNumberText(out.at(-1)?.text)) {
			out.push({ text: '分', isWord: 1, phoneticToken: phonetic('分', 'ふん') }, { text: 'の', isWord: 1, phoneticToken: phonetic('の', 'の') });
			continue;
		}
		out.push(t);
	}
	return out;
}

/** Readings of numbers with counters, dates, times and weekday abbreviations. Returns new tokens; input is unchanged. */
export function applyJapaneseNumberReadings(input: AnnotatedToken[]): AnnotatedToken[] {
	const tokens = input.map(t => ({ ...t }));
	tokens.forEach((t, i) => {
		const question = QUESTION_COUNTERS[t.text];
		// 何分 ぐらい, 何時ですか: the counting reading (なにぶん "anyway" only before a comma)
		if (question && !(t.text === '何分' && /^[、,]$/.test(tokens[i + 1]?.text ?? ''))) { t.phoneticToken = question.reading; return; }
		if (isWeekday(tokens, i)) { t.phoneticToken = phonetic(t.text, WEEKDAYS[t.text][0]); return; }
		const rule = JAPANESE_COUNTERS[t.text];
		if (!rule) return;
		const prev = tokens[i - 1];
		if (prev?.text === '何') {
			const r = rule('nan', 'なん');
			prev.phoneticToken = phonetic('何', r.number);
			t.phoneticToken = phonetic(t.text, r.counter);
			return;
		}
		const n = parseJapaneseNumber(prev?.text);
		if (n === null || !prev) return;
		// one day (1日間, or 1日 outside a date) is いちにち
		const r = t.text === '日' && n === 1 && !isDateContext(tokens, i) ? { number: 'いち', counter: 'にち' } : rule(n, japaneseNumberReading(n));
		prev.phoneticToken = phonetic(prev.text, r.number);
		t.phoneticToken = phonetic(t.text, r.counter);
		if (hasLeadingZero(prev.text)) prev.isWord = 1; // 04月: a zero-padded number read as its value
	});
	return tokens;
}

/** Counting glosses: a counter after a number (or 何), 何 + counter words, and weekday abbreviations. */
export function applyJapaneseCounterGlosses(input: AnnotatedToken[]): AnnotatedToken[] {
	const tokens = input.map(t => ({ ...t }));
	tokens.forEach((t, i) => {
		const question = QUESTION_COUNTERS[t.text];
		if (question && !(t.text === '何分' && /^[、,]$/.test(tokens[i + 1]?.text ?? ''))) { t.gloss = question.gloss; return; }
		if (isWeekday(tokens, i)) { t.gloss = WEEKDAYS[t.text][1]; return; }
		const prev = tokens[i - 1]?.text;
		const counting = isNumberText(prev) || prev === '何';
		if (counting && JAPANESE_COUNTER_GLOSSES[t.text]) t.gloss = JAPANESE_COUNTER_GLOSSES[t.text];
		// 一つ目, 二つ目, 3つ目, いくつ目 (which number): the ordinal -th
		if (t.text === '目' && (/^(?:[一二三四五六七八九十]つ|いくつ|つ|番)$/.test(prev ?? ''))) t.gloss = '-th';
	});
	return tokens;
}
