// Grammatical context senses: particles and a few common words whose gloss depends on the words around them, decided
// from Kuromoji's analysis of the whole text (parts of speech, dictionary forms), not from word lists of topics.
//
// Underfit on purpose: each rule changes a gloss only on explicit evidence (the particle's verb, a question word, a
// period + count); anything else keeps the gloss it already has. A fragment without its verb (家族と, 旅行に何を…) is
// left alone, and so is に after a time or adverbial word (前に, ときに, 一緒に, 3時に), whose sense the verb doesn't
// decide.
//
// Runs after applyJapaneseGlossTreatments, so these are the strongest glosses for the tokens they touch.
import type { AnnotatedToken } from '../types';
import { morphemeSpans, type JapaneseMorpheme } from '../shared/morphemes';
import { precipitationBefore } from '../shared/weather';

type Span = JapaneseMorpheme & { start: number; end: number };

// に + verb: the verb decides what に marks.
const MOTION_VERBS = new Set(['行く', '行ける', '来る', '来れる', '帰る', '帰れる', '戻る', '向かう', '曲がる', '進む']);    // to (a place)
const BOARDING_VERBS = new Set(['乗る', '乗れる']);                                                                      // on (a vehicle)
const TELLING_VERBS = new Set(['聞く', '聞ける', '言う', '話す', '教える', '伝える', '送る', '渡す', '返す', '尋ねる']);     // to (a person)
const TELLING_NOUNS = new Set(['連絡', '電話', '説明', '質問', '相談', '報告']);                                           // …する: to (a person)
// と + verb of doing something together: with.
const COMPANY_VERBS = new Set(['会う', '遊ぶ', '住む', '働く', '暮らす', '行く', '来る', '出かける']);
const COMPANY_NOUNS = new Set(['旅行', '結婚', '一緒', '散歩', '食事', '話']);                                             // 旅行する, 一緒に
// よく + verb of knowing or managing: well (よく知りません, よくわかります). Elsewhere よく keeps "often".
const KNOWING_VERBS = new Set(['知る', 'わかる', '分かる', '見える', '聞こえる', '覚える', 'できる', '眠れる']);
// でも after a question word: -ever (どの席でも, 何でも, いつでも). Elsewhere (お茶でも) でも keeps its gloss.
const QUESTION_WORDS = new Set(['何', 'なに', 'なん', '誰', 'だれ', 'どこ', 'いつ', 'どれ', 'どちら', 'どっち']);
const QUESTION_DETERMINERS = new Set(['どの', 'どんな']);
// A period + に + a count: per (週に一回, 1日に3回, 月に2回).
const PERIODS = new Set(['日', '週', '月', '年']);

export function applyJapaneseContextGlosses(tokens: AnnotatedToken[], morphemes: JapaneseMorpheme[]): AnnotatedToken[] {
	const spans: Span[] = morphemeSpans(morphemes);
	const out = tokens.map(token => ({ ...token }));
	const starts: number[] = [];
	let at = 0;
	for (const token of out) { starts.push(at); at += token.text.length; }
	const startingAt = (position: number) => spans.find(m => m.start === position);
	const endingAt = (position: number) => spans.find(m => m.end === position);
	const isParticle = (index: number, text: string) => out[index]?.text === text && startingAt(starts[index])?.pos === '助詞';
	/** The dictionary form of the verb right after a token (a サ変 noun + する counts as the noun), or null. */
	const verbAfter = (index: number): { verb?: string; noun?: string } | null => {
		const next = startingAt(starts[index] + out[index].text.length);
		if (!next) return null;
		if (next.pos === '動詞') return { verb: next.basic_form };
		if (next.pos === '名詞' && next.pos_detail_1 === 'サ変接続') {
			const after = startingAt(next.end);
			if (after?.pos === '動詞' && after.basic_form === 'する') return { noun: next.surface_form };
			if (next.surface_form === '一緒') return { noun: next.surface_form };
		}
		return null;
	};
	/** The morpheme right before a token. */
	const before = (index: number) => endingAt(starts[index]);
	/** Words that set the time or manner of a clause rather than a place or person: に after them is not decided by the verb. */
	const isTimeOrManner = (m: Span | undefined) => !m || m.pos !== '名詞' || ['副詞可能', '非自立', '接尾', '数', '形容動詞語幹'].includes(m.pos_detail_1 ?? '') || m.surface_form === '一緒';

	out.forEach((token, index) => {
		switch (token.text) {
			case 'に': {
				if (!isParticle(index, 'に')) return;
				const previous = before(index), next = startingAt(starts[index] + 1);
				// 週に一回: per; and the period is a period (月 month, not moon)
				if (previous && PERIODS.has(previous.surface_form) && out[index - 1]?.text === previous.surface_form && next?.pos === '名詞' && next.pos_detail_1 === '数') {
					token.gloss = 'per';
					if (previous.surface_form === '月') out[index - 1].gloss = 'month';
					return;
				}
				if (isTimeOrManner(previous)) return;
				const after = verbAfter(index);
				if (!after) return;
				if (after.verb && BOARDING_VERBS.has(after.verb)) token.gloss = 'on';
				else if (after.verb && (MOTION_VERBS.has(after.verb) || TELLING_VERBS.has(after.verb))) token.gloss = 'to';
				else if (after.noun && TELLING_NOUNS.has(after.noun)) token.gloss = 'to';
				return;
			}
			case 'と': {
				if (!isParticle(index, 'と') || before(index)?.pos !== '名詞') return;
				const after = verbAfter(index);
				if ((after?.verb && COMPANY_VERBS.has(after.verb)) || (after?.noun && COMPANY_NOUNS.has(after.noun))) token.gloss = 'with';
				return;
			}
			case 'でも': {
				const m = startingAt(starts[index]);
				if (m?.pos !== '助詞' || m.pos_detail_1 !== '副助詞') return;
				const previous = before(index), determiner = previous && endingAt(previous.start);
				if ((previous && QUESTION_WORDS.has(previous.surface_form)) || (previous?.pos === '名詞' && determiner && QUESTION_DETERMINERS.has(determiner.surface_form))) token.gloss = '-ever';
				return;
			}
			case 'よく': {
				const after = verbAfter(index);
				if (startingAt(starts[index])?.pos === '副詞' && after?.verb && KNOWING_VERBS.has(after.verb)) token.gloss = 'well';
				return;
			}
			case '中': {
				// 旅行中, 授業中 (ちゅう, a suffix): during. 電車の中 (なか) stays inside; 世界中 (じゅう) is one word.
				const reading = (token.phoneticToken ?? []).map(part => part[1] ?? part[0]).join('');
				if (startingAt(starts[index])?.pos_detail_1 === '接尾' && reading === 'ちゅう') token.gloss = 'during';
				if (out[index - 1]?.text === '話し' && reading === 'ちゅう') token.gloss = 'in progress';
				if (out[index - 1]?.text === '晩' && reading === 'じゅう') token.gloss = 'throughout';
				return;
			}
			case '辺': {
				if (['この', 'その', 'あの'].includes(out[index - 1]?.text ?? '')) token.gloss = 'area';   // この辺: this area
				return;
			}
		}
		if (token.text === '降り' || token.text === '降って') {
			const weather = precipitationBefore(morphemes, spans.findIndex(m => m.start === starts[index]));
			if (weather) token.gloss = weather;
		}
		if (token.text === '撮り' && out[index - 1]?.text === 'を' && out[index - 2]?.text === '写真') token.gloss = 'take';
		if (token.text === '塗って' && out[index - 1]?.text === 'を' && ['バター', 'ジャム'].includes(out[index - 2]?.text)) {
			token.gloss = 'spread';
		}
		// 困ったとき, 困った時, 困った場合: (when) in trouble. Before a noun otherwise (困った人) it keeps its gloss.
		if (/^困っ(た)?$/.test(token.text) && startingAt(starts[index])?.basic_form === '困る') {
			const rest = out.slice(index + 1).map(t => t.text);
			const next = token.text === '困っ' ? rest[1] : rest[0];
			if (token.text === '困っ' && rest[0] !== 'た') return;
			if (['とき', '時', '場合'].includes(next ?? '')) token.gloss = 'in trouble';
		}
		// 聞く after に: ask (人に聞きます, 誰に聞きますか). 音楽を聞きます keeps listen.
		if (/^聞/.test(token.text) && startingAt(starts[index])?.basic_form === '聞く' && isParticle(index - 1, 'に')) token.gloss = 'ask';
	});
	return out;
}
