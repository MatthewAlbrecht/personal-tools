const TICKETMASTER_EVENTS_URL =
	"https://app.ticketmaster.com/discovery/v2/events.json";
export const DEFAULT_TICKETMASTER_PAGE_SIZE = 199;
export const MAX_TICKETMASTER_PAGE_SIZE = 199;

export type NormalizedTicketmasterVenue = {
	tmVenueId: string;
	name: string;
	city?: string;
	stateCode?: string;
	address?: string;
	postalCode?: string;
	latitude?: number;
	longitude?: number;
};

export type NormalizedTicketmasterEvent = {
	tmEventId: string;
	name: string;
	url?: string;
	imageUrl?: string;
	localDate?: string;
	localTime?: string;
	dateTime?: string;
	tmStatus?: string;
	publicSaleStartDateTime?: string;
	attractionNames: string[];
	venue: NormalizedTicketmasterVenue;
};

export type TicketmasterPage = {
	size?: number;
	totalElements?: number;
	totalPages?: number;
	number?: number;
};

type TicketmasterEventResponse = {
	page?: TicketmasterPage;
	_embedded?: { events?: TicketmasterEvent[] };
};

type TicketmasterEvent = {
	id?: string;
	name?: string;
	url?: string;
	dates?: {
		start?: { localDate?: string; localTime?: string; dateTime?: string };
		status?: { code?: string };
	};
	sales?: {
		public?: { startDateTime?: string };
	};
	images?: TicketmasterImage[];
	_embedded?: {
		venues?: TicketmasterVenue[];
		attractions?: { name?: string }[];
	};
};

type TicketmasterImage = {
	url?: string;
	width?: number;
	height?: number;
};

type TicketmasterVenue = {
	id?: string;
	name?: string;
	city?: { name?: string };
	state?: { stateCode?: string };
	address?: { line1?: string };
	postalCode?: string;
	location?: { latitude?: string; longitude?: string };
};

export function buildTicketmasterEventSearchUrl({
	apiKey,
	page,
	size = DEFAULT_TICKETMASTER_PAGE_SIZE,
	startDateTime,
	geoPoint,
	postalCode,
	radius,
	venueId,
}: {
	apiKey: string;
	page: number;
	size?: number;
	startDateTime: string;
	geoPoint?: string;
	postalCode?: string;
	radius?: string;
	venueId?: string;
}): URL {
	const url = new URL(TICKETMASTER_EVENTS_URL);
	url.search = new URLSearchParams({
		apikey: apiKey,
		classificationName: "music",
		countryCode: "US",
		includeTBA: "no",
		includeTBD: "no",
		page: String(page),
		size: String(Math.min(size, MAX_TICKETMASTER_PAGE_SIZE)),
		sort: "date,asc",
		startDateTime,
		unit: "miles",
	}).toString();

	if (geoPoint) url.searchParams.set("geoPoint", geoPoint);
	if (postalCode) url.searchParams.set("postalCode", postalCode);
	if (radius) url.searchParams.set("radius", radius);
	if (venueId) url.searchParams.set("venueId", venueId);

	return url;
}

export function buildTicketmasterVenueEventSearchUrl({
	apiKey,
	page,
	size = DEFAULT_TICKETMASTER_PAGE_SIZE,
	venueId,
}: {
	apiKey: string;
	page: number;
	size?: number;
	venueId: string;
}): URL {
	const url = new URL(TICKETMASTER_EVENTS_URL);
	url.search = new URLSearchParams({
		apikey: apiKey,
		page: String(page),
		size: String(Math.min(size, MAX_TICKETMASTER_PAGE_SIZE)),
		sort: "date,asc",
		venueId,
	}).toString();

	return url;
}

export function formatTicketmasterDate(date: Date): string {
	return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function getTicketmasterPage(
	data: unknown,
): TicketmasterPage | undefined {
	if (!isTicketmasterEventResponse(data)) return undefined;
	return data.page;
}

export function normalizeTicketmasterEventsResponse(
	data: unknown,
): NormalizedTicketmasterEvent[] {
	if (!isTicketmasterEventResponse(data)) return [];

	return (data._embedded?.events ?? [])
		.map((event) => normalizeTicketmasterEvent(event))
		.filter((event) => event !== null);
}

export function getVenueOptions(events: NormalizedTicketmasterEvent[]) {
	const venuesById = new Map<
		string,
		NormalizedTicketmasterEvent["venue"] & { eventCount: number }
	>();

	for (const event of events) {
		const existing = venuesById.get(event.venue.tmVenueId);
		if (existing) {
			venuesById.set(event.venue.tmVenueId, {
				...existing,
				eventCount: existing.eventCount + 1,
			});
			continue;
		}

		venuesById.set(event.venue.tmVenueId, {
			...event.venue,
			eventCount: 1,
		});
	}

	return [...venuesById.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeTicketmasterEvent(
	event: TicketmasterEvent,
): NormalizedTicketmasterEvent | null {
	const venue = event._embedded?.venues?.[0];

	if (!event.id || !event.name || !venue?.id || !venue.name) {
		return null;
	}

	return {
		tmEventId: event.id,
		name: event.name,
		url: event.url,
		imageUrl: getBestImageUrl(event.images ?? []),
		localDate: event.dates?.start?.localDate,
		localTime: event.dates?.start?.localTime,
		dateTime: event.dates?.start?.dateTime,
		tmStatus: event.dates?.status?.code,
		publicSaleStartDateTime: event.sales?.public?.startDateTime,
		attractionNames: (event._embedded?.attractions ?? [])
			.map((attraction) => attraction.name)
			.filter((name): name is string => Boolean(name)),
		venue: {
			tmVenueId: venue.id,
			name: venue.name,
			city: venue.city?.name,
			stateCode: venue.state?.stateCode,
			address: venue.address?.line1,
			postalCode: venue.postalCode,
			latitude: parseOptionalNumber(venue.location?.latitude),
			longitude: parseOptionalNumber(venue.location?.longitude),
		},
	};
}

function getBestImageUrl(images: TicketmasterImage[]): string | undefined {
	return [...images].sort(
		(a, b) =>
			(b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0),
	)[0]?.url;
}

function parseOptionalNumber(value: string | undefined): number | undefined {
	if (!value) return undefined;

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function isTicketmasterEventResponse(
	data: unknown,
): data is TicketmasterEventResponse {
	return typeof data === "object" && data !== null;
}
