import type { PhoneticToken } from '../types';

// Small lexical supplements, not universal per-kanji readings. The unusual
// spellings are retained verbatim; see README for source-text uncertainties.
export const reviewedJapaneseReadings: [string, PhoneticToken][] = [
  ['受け就ぐ', [['受', 'う'], ['け'], ['就', 'つ'], ['ぐ']]],
  ['授任', [['授', 'じゅ'], ['任', 'にん']]],
  ['心撃', [['心', 'しん'], ['撃', 'げき']]],
  ['爵', [['爵', 'しゃく']]],
  ['痘卿', [['痘', 'とう'], ['卿', 'きょう']]],
  ['骨髄痘', [['骨', 'こつ'], ['髄', 'ずい'], ['痘', 'とう']]],
  ['確める', [['確', 'たしか'], ['める']]],
  ['耐毒剤', [['耐', 'たい'], ['毒', 'どく'], ['剤', 'ざい']]],
  ['排泄腔', [['排', 'はい'], ['泄', 'せつ'], ['腔', 'こう']]],
  ['読心', [['読', 'どく'], ['心', 'しん']]],
  ['大読師', [['大', 'だい'], ['読', 'どく'], ['師', 'し']]],
  ['無貌', [['無', 'む'], ['貌', 'ぼう']]],
  ['鉄鋏', [['鉄', 'かな'], ['鋏', 'ばさみ']]],
  // Both いきち and しきいち are valid; use the conventional いきち
  // only to fill missing readings, preserving either existing kana reading.
  ['閾値', [['閾', 'いき'], ['値', 'ち']]],
  ['歓', [['歓', 'かん']]], // interrupted 歓...迎
  ['吐', [['吐', 'は']]], // interrupted 吐、吐き気; only via contextual rule below
  ['逃が', [['逃', 'に'], ['が']]], // interrupted 逃が...した
  ['會', [['會', 'かい']]], // literal old form of 会; NOT a correction to 手
  ['空鬱', [['空', 'くう'], ['鬱', 'うつ']]], // literal reading, not a claim of a standard word
];

// These two one-character fragments only have a reviewed reading in the
// supplied interrupted phrases. Do not change ordinary standalone 吐/歓.
export const contextualFragmentReadings: { text: string; following?: string; preceding?: string; reading: string }[] = [
  { text: '吐', following: '、吐き気', reading: 'は' },
  { text: '歓', following: '... 迎', reading: 'かん' },
  { text: '迎', preceding: '歓... ', reading: 'げい' },
];
