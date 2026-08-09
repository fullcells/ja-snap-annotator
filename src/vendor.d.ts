declare module 'kuroshiro-analyzer-kuromoji' {
	export default class KuromojiAnalyzer {
		constructor(options?: { dictPath?: string });
		init(): Promise<void>;
		parse(text: string): Promise<unknown[]>;
	}
}
