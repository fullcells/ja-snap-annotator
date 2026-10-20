import { protectedJapaneseReadingText } from "../treatments/spelling-overrides";
import type { AnnotatedToken, PhoneticToken } from '../types';
import entries from './jmdict-furigana.json';
export { default as japaneseReadingSource } from './jmdict-furigana-source.json';

const hira = (s: string) => s.normalize('NFKC').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
let dictionary: Map<string, PhoneticToken[]> | undefined;
function readings() {
  if (!dictionary) {
    dictionary = new Map();
    for (const [text, parts] of entries as [string, PhoneticToken][]) {
      const options = dictionary.get(text) ?? [];
      const reading = parts.map(p => hira(p[1] ?? p[0])).join('');
      if (!options.some(option => option.map(p => hira(p[1] ?? p[0])).join('') === reading)) options.push(parts);
      dictionary.set(text, options);
    }
  }
  return dictionary;
}

/** Choose a whole-word dictionary reading, retaining ambiguity and character spans.
 * Safe for cached annotations too: token text, boundaries and glosses stay unchanged.
 * Dictionary data never overrides explicitly protected readings.
 */
export function resolveJapaneseReadings(tokens: AnnotatedToken[], protectedText: ReadonlySet<string> = new Set()): AnnotatedToken[] {
  const isProtected = (text: string) => protectedJapaneseReadingText.has(text) || protectedText.has(text);
  const output = tokens.map(token => ({ ...token }));
  for (let start = 0; start < tokens.length; start++) {
    if (tokens[start]?.isWord !== 1) continue;
    let surface = '';
    let chosen: { end: number; parts: PhoneticToken[] } | undefined;
    // Restrict lookup to complete adjacent lexical tokens, not arbitrary substrings
    // inside sentences, inflections, punctuation or whitespace.
    for (let end = start; end < tokens.length && end < start + 16; end++) {
      const token = tokens[end]!;
      if (token.isWord !== 1 || /\s/u.test(token.text) || isProtected(token.text)) break;
      surface += token.text;
      if (surface.length > 64) break;
      if ([...surface].length < 2) continue; // Do not replace isolated names/characters with dictionary stems.
      const options = readings().get(surface);
      if (!options) continue;
      const currentReading = tokens.slice(start, end + 1).flatMap(t => t.phoneticToken ?? [[t.text]]).map(p => hira(p[1] ?? p[0])).join('');
      const matching = options.find(parts => parts.map(p => hira(p[1] ?? p[0])).join('') === currentReading);
      const selected = matching ?? (options.length === 1 ? options[0] : undefined);
      if (!selected) continue; // Never pick the first of several plausible readings.
      // Split self-reading kana so existing lexical boundaries remain possible;
      // indivisible multi-kanji readings stay together.
      const parts: PhoneticToken = selected.flatMap(p => !p[1] && /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(p[0]) ? [...p[0]].map(c => [c, hira(c)] as [string,string]) : [[p[0], hira(p[1] ?? p[0])]]);
      const groups: PhoneticToken[] = [];
      let cursor = 0;
      let valid = true;
      for (const target of tokens.slice(start, end + 1)) {
        let chars = ''; const group: PhoneticToken = [];
        while (cursor < parts.length && chars.length < target.text.length) {
          const part = parts[cursor++]!; chars += part[0]; group.push([...part] as typeof part);
        }
        if (chars !== target.text) { valid = false; break; }
        groups.push(group);
      }
      if (valid && cursor === parts.length) chosen = { end, parts: groups };
    }
    if (!chosen) continue;
    chosen.parts.forEach((parts, offset) => {
      const token = tokens[start + offset]!;
      // Preserve active per-character handwritten corrections as supplied by the pipeline.
      if (token.phoneticToken?.some(part => isProtected(part[0]))) return;
      output[start + offset] = { ...token, phoneticToken: parts };
    });
    start = chosen.end;
  }
  return output;
}
