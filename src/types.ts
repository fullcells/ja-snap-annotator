export type PhoneticPart = [chars: string] | [chars: string, spelling: string];
export type PhoneticToken = PhoneticPart[];

export type AnnotatedToken = {
	text: string;
	isWord: number;
	gloss?: string | null;
	phoneticToken?: PhoneticToken | null;
};

// Kept compatible with Lingoprocessor's existing words2/SBWordRow2 shape.
export type SBWordRow2 = {
	id: number;
	word_lang: string;
	word: string;
	gloss: string;
	gloss_lang: string;
	is_core: boolean;
	created_at: string;
	is_human_verified: boolean;
};
