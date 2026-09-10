export type ListenUserAlbumFields = {
	listenCount?: number;
	firstListenedAt?: number;
};

export type ListenEnrichment = {
	listenCount: number;
	firstListenedAt?: number;
	isFirstListen: boolean;
};

export function buildListenOrdinalsById(
	listens: Array<{ _id: string; listenedAt: number }>,
): Map<string, number> {
	const sorted = [...listens].sort((a, b) => {
		if (a.listenedAt !== b.listenedAt) {
			return a.listenedAt - b.listenedAt;
		}
		if (a._id < b._id) {
			return -1;
		}
		if (a._id > b._id) {
			return 1;
		}
		return 0;
	});

	const ordinals = new Map<string, number>();
	for (const [index, listen] of sorted.entries()) {
		ordinals.set(listen._id, index + 1);
	}
	return ordinals;
}

export function enrichListenWithUserAlbum<
	TListen extends { listenedAt: number },
>(
	listen: TListen,
	userAlbum: ListenUserAlbumFields | null | undefined,
	listenOrdinal: number,
): TListen & ListenEnrichment {
	const firstListenedAt = userAlbum?.firstListenedAt;
	const isFirstListen =
		firstListenedAt !== undefined && listen.listenedAt === firstListenedAt;

	return {
		...listen,
		listenCount: listenOrdinal,
		...(firstListenedAt !== undefined ? { firstListenedAt } : {}),
		isFirstListen,
	};
}
