export type ListenUserAlbumFields = {
	listenCount?: number;
	firstListenedAt?: number;
};

export type ListenEnrichment = {
	listenCount: number;
	firstListenedAt?: number;
	isFirstListen: boolean;
};

export function enrichListenWithUserAlbum<
	TListen extends { listenedAt: number },
>(
	listen: TListen,
	userAlbum: ListenUserAlbumFields | null | undefined,
): TListen & ListenEnrichment {
	const listenCount = userAlbum?.listenCount ?? 0;
	const firstListenedAt = userAlbum?.firstListenedAt;
	const isFirstListen =
		firstListenedAt !== undefined && listen.listenedAt === firstListenedAt;

	return {
		...listen,
		listenCount,
		...(firstListenedAt !== undefined ? { firstListenedAt } : {}),
		isFirstListen,
	};
}
