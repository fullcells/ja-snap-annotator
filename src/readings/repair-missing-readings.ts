import entries from './jmdict-furigana.json';
import { contextualFragmentReadings, reviewedJapaneseReadings } from './reviewed-readings';
import type { AnnotatedToken, PhoneticToken } from '../types';

const han = /\p{Script=Han}/u;
const hira = (s: string) => s.normalize('NFKC').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
type Candidate = { surface: string; offset: number; reading: string };
const cache = new Map<string, Candidate[]>();
const reviewedSurfaces = new Set(reviewedJapaneseReadings.map(([text]) => text));
const sourceEntries = [
  ...(entries as [string, PhoneticToken][]).filter(([text]) => !reviewedSurfaces.has(text)),
  ...reviewedJapaneseReadings,
];
const endings: Record<string, string[]> = {
  'う': ['わ', 'い', 'え', 'お', 'っ'], 'く': ['か', 'き', 'け', 'こ', 'い'],
  'ぐ': ['が', 'ぎ', 'げ', 'ご', 'い'], 'す': ['さ', 'し', 'せ', 'そ'],
  'つ': ['た', 'ち', 'て', 'と', 'っ'], 'ぬ': ['な', 'に', 'ね', 'の', 'ん'],
  'ぶ': ['ば', 'び', 'べ', 'ぼ', 'ん'], 'む': ['ま', 'み', 'め', 'も', 'ん'],
  'る': ['ら', 'り', 'れ', 'ろ', 'っ'],
};

function candidates(chars: string): Candidate[] {
  const cached = cache.get(chars);
  if (cached) return cached;
  const found: Candidate[] = [];
  for (const [surface, parts] of sourceEntries) {
    if (!surface.includes(chars)) continue;
    if (surface === '吐' || surface === '歓') continue;
    // Reuse aligned dictionary stems for inflections. No character's most
    // frequent on/kun reading is ever used as a general-purpose default.
    const variants = [surface];
    const last = surface.slice(-1);
    if (endings[last] && parts[parts.length - 1]?.[0].endsWith(last)) {
      variants.push(...endings[last].map(end => surface.slice(0, -1) + end));
      // Ichidan/longer kana stems (咥える -> 咥え, 憑りつく -> 憑りつ).
      if (/[ぁ-ゖ]{2}$/u.test(surface)) variants.push(surface.slice(0, -1));
    }
    let offset = 0;
    for (const part of parts) {
      if (part[0] === chars && part[1] && !han.test(part[1])) {
        for (const variant of variants) {
          if (variant.slice(offset, offset + chars.length) === chars)
            found.push({ surface: variant, offset, reading: hira(part[1]) });
        }
      }
      offset += part[0].length;
    }
  }
  cache.set(chars, found);
  return found;
}

/** Repair unresolved aligned parts using the longest matching lexical context.
 * Boundaries, known readings, glosses and indivisible kanji groups are retained.
 * Tied alternative readings stay unresolved. Data is indexed only on demand.
 */
export function repairMissingJapaneseReadings(tokens: AnnotatedToken[], isProtected: (text: string) => boolean): AnnotatedToken[] {
  const text = tokens.map(t => t.text).join('');
  let tokenOffset = 0;
  return tokens.map(token => {
    const start = tokenOffset;
    tokenOffset += token.text.length;
    if (token.isWord !== 1 || isProtected(token.text)) return { ...token };
    const parts = token.phoneticToken ?? [[token.text]];
    if (parts.map(p => p[0]).join('') !== token.text) return { ...token };
    let partOffset = start;
    const repaired: PhoneticToken = parts.map(part => {
      const position = partOffset;
      partOffset += part[0].length;
      if (isProtected(part[0])) return [...part];
      const fragment = contextualFragmentReadings.find(r => r.text === part[0]
        && (!r.following || text.startsWith(r.following, partOffset))
        && (!r.preceding || text.slice(0, position).endsWith(r.preceding)));
      if (fragment) return [part[0], fragment.reading];
      if (!han.test(part[1] ?? part[0])) return [...part];
      const matches = candidates(part[0]).filter(c => {
        const left = position - c.offset;
        // A one-character entry is valid only for a whole tokenizer token.
        if (c.surface === part[0] && token.text !== part[0]) return false;
        return left >= 0 && text.startsWith(c.surface, left);
      });
      const length = Math.max(0, ...matches.map(c => c.surface.length));
      const readings = new Set(matches.filter(c => c.surface.length === length).map(c => c.reading));
      return readings.size === 1 ? [part[0], [...readings][0]] : [...part];
    });
    return { ...token, phoneticToken: repaired };
  });
}
