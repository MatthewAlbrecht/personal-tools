export type Spine = {
	x: number;
	width: number;
	height: number;
	tone: number;
};

export function createRng(seed: number): () => number {
	let state = seed >>> 0;
	return function next(): number {
		state += 0x6d2b79f5;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function fillBookBay(
	width: number,
	height: number,
	seed: number,
): Spine[] {
	if (width < 0.3 || height < 0.3) return [];
	const rand = createRng(seed);
	const spines: Spine[] = [];
	let cursor = 0.04;

	while (cursor < width - 0.28) {
		const remaining = width - cursor;
		const widthGuess = 0.32 + rand() * 1.7;
		const spineWidth = Math.min(widthGuess, remaining - 0.04);
		if (spineWidth < 0.22) break;
		const roll = rand();
		const heightRatio =
			roll > 0.82 ? 0.52 + rand() * 0.12 : 0.68 + rand() * 0.3;
		spines.push({
			x: cursor,
			width: spineWidth,
			height: height * heightRatio,
			tone: 0.12 + rand() * 0.62,
		});
		cursor += spineWidth + 0.04 + (rand() > 0.88 ? 0.18 : 0);
	}

	return spines;
}
