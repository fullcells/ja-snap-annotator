export const spellingOverrides: Record<string, string> = {
	'色': 'いろ',
};

// These reviewed readings remain authoritative during dictionary resolution.
export const protectedJapaneseReadingText: ReadonlySet<string> = new Set([...Object.keys(spellingOverrides), "緑色"]);
