// Kuromoji morphemes (from kuroshiro-analyzer-kuromoji's parse() of the whole text), shared by token merging and the
// gloss fallbacks.

/** A Kuromoji morpheme, as kuroshiro-analyzer-kuromoji's parse() returns it. */
export type JapaneseMorpheme = {
	surface_form: string;
	pos: string;
	pos_detail_1?: string;
	pos_detail_2?: string;
	basic_form: string;
	verbose?: { word_position?: number };
};

/** Morphemes with their character spans in the text (word_position is 1-based; otherwise they are laid end to end). */
export function morphemeSpans<M extends JapaneseMorpheme>(morphemes: M[]): (M & { start: number; end: number })[] {
	let at = 0;
	return morphemes.map(m => {
		const start = m.verbose?.word_position ? m.verbose.word_position - 1 : at;
		at = start + m.surface_form.length;
		return { ...m, start, end: at };
	});
}
