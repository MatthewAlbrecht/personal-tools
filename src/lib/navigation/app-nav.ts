export type AppNavItem = {
	id: string;
	label: string;
	href: string;
	/** Path prefixes that count as active for this item */
	matchPrefixes?: string[];
};

export type AppNavGroup = {
	id: "my-albums" | "music" | "more";
	label: string;
	items: AppNavItem[];
	/** Collapsed by default on desktop */
	defaultCollapsed?: boolean;
};

export const APP_NAV_GROUPS: AppNavGroup[] = [
	{
		id: "my-albums",
		label: "My Albums",
		items: [
			{
				id: "listens",
				label: "Listens",
				href: "/albums/recent",
				matchPrefixes: ["/albums/recent"],
			},
			{
				id: "rankings",
				label: "Rankings",
				href: "/albums/rated",
				matchPrefixes: ["/albums/rated"],
			},
			{
				id: "queue",
				label: "Queue",
				href: "/albums/up-next",
				matchPrefixes: ["/albums/up-next"],
			},
			{
				id: "library",
				label: "Library",
				href: "/albums/library",
				matchPrefixes: ["/albums/library", "/albums/details"],
			},
		],
	},
	{
		id: "music",
		label: "Music",
		items: [
			{ id: "funnel", label: "Funnel", href: "/music-funnel" },
			{
				id: "lyrics",
				label: "Lyrics",
				href: "/lyrics",
				matchPrefixes: ["/lyrics", "/playlist-lyrics"],
			},
			{ id: "playlists", label: "Playlists", href: "/smart-playlists" },
		],
	},
	{
		id: "more",
		label: "More",
		defaultCollapsed: true,
		items: [
			{
				id: "shows",
				label: "Shows",
				href: "/concerts/upcoming",
				matchPrefixes: ["/concerts"],
			},
			{ id: "tracks", label: "Tracks", href: "/albums/tracks" },
			{ id: "enrichment", label: "Enrichment", href: "/album-enrichment" },
			{
				id: "categorize",
				label: "Categorize tracks",
				href: "/spotify-playlister",
			},
			{ id: "robs", label: "Rob's Top 50", href: "/robs-rankings" },
			{ id: "folio", label: "Folio Society", href: "/folio-society" },
			{ id: "birthdays", label: "Birthdays", href: "/birthdays" },
			{ id: "rooleases", label: "Rooleases", href: "/rooleases" },
			{ id: "articles", label: "Articles", href: "/articles" },
			{ id: "books", label: "Books", href: "/books" },
			{ id: "bookcase", label: "Bookcase", href: "/bookcase" },
		],
	},
];

export function getAppNavGroups(): AppNavGroup[] {
	return APP_NAV_GROUPS;
}

export function isNavItemActive(pathname: string, item: AppNavItem): boolean {
	const prefixes = item.matchPrefixes ?? [item.href];
	return prefixes.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}
