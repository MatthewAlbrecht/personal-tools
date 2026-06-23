import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { action } from "./_generated/server";
import {
	DEFAULT_TICKETMASTER_PAGE_SIZE,
	type NormalizedTicketmasterEvent,
	buildTicketmasterEventSearchUrl,
	buildTicketmasterVenueEventSearchUrl,
	formatTicketmasterDate,
	getTicketmasterPage,
	getVenueOptions,
	normalizeTicketmasterEventsResponse,
} from "./_utils/ticketmasterConcerts";

const MAX_TICKETMASTER_PAGES_PER_VENUE = 5;
const listSelectedVenuesRef = makeFunctionReference<"query">(
	"concerts:listSelectedVenues",
);
const upsertEventsFromTicketmasterRef = makeFunctionReference<"mutation">(
	"concerts:upsertEventsFromTicketmaster",
);

type SelectedConcertVenueActionRow = Doc<"userConcertVenues"> & {
	venue: Doc<"concertVenues">;
};

type SyncSelectedVenueEventsResult = {
	venues: {
		venueId: Doc<"concertVenues">["_id"];
		tmVenueId: string;
		venueName: string;
		inserted: number;
		updated: number;
		totalFetched: number;
		failed: boolean;
		error?: string;
	}[];
};

type UpsertEventsFromTicketmasterResult = {
	inserted: number;
	updated: number;
	total: number;
};

export const discoverTicketmasterEvents = action({
	args: {
		postalCode: v.string(),
		radius: v.string(),
		size: v.optional(v.number()),
	},
	handler: async (_ctx, args) => {
		const apiKey = getTicketmasterApiKey();
		const location = getTicketmasterLocationParams(args.postalCode);
		const data = await fetchTicketmasterEvents({
			apiKey,
			page: 0,
			...location,
			radius: args.radius,
			size: args.size ?? DEFAULT_TICKETMASTER_PAGE_SIZE,
		});
		const events = normalizeTicketmasterEventsResponse(data);

		return {
			events,
			venues: getVenueOptions(events),
			page: getTicketmasterPage(data),
		};
	},
});

export const syncSelectedVenueEvents = action({
	args: {
		userId: v.string(),
	},
	handler: async (ctx, args): Promise<SyncSelectedVenueEventsResult> => {
		const apiKey = getTicketmasterApiKey();
		const selectedVenues = (await ctx.runQuery(listSelectedVenuesRef, {
			userId: args.userId,
		})) as SelectedConcertVenueActionRow[];

		const summaries: SyncSelectedVenueEventsResult["venues"] = [];

		for (const selectedVenue of selectedVenues) {
			try {
				const events: NormalizedTicketmasterEvent[] = [];
				let nextPage = 0;
				let totalPages: number | undefined;

				while (
					nextPage < MAX_TICKETMASTER_PAGES_PER_VENUE &&
					(totalPages === undefined || nextPage < totalPages)
				) {
					const data = await fetchTicketmasterEvents({
						apiKey,
						page: nextPage,
						size: DEFAULT_TICKETMASTER_PAGE_SIZE,
						venueId: selectedVenue.venue.tmVenueId,
					});
					const page = getTicketmasterPage(data);

					events.push(...normalizeTicketmasterEventsResponse(data));
					totalPages = page?.totalPages;
					nextPage = (page?.number ?? nextPage) + 1;

					if (page?.totalPages === undefined && page?.number === undefined) {
						break;
					}
				}

				const upserted = (await ctx.runMutation(
					upsertEventsFromTicketmasterRef,
					{
						userId: args.userId,
						events,
					},
				)) as UpsertEventsFromTicketmasterResult;

				summaries.push({
					venueId: selectedVenue.venueId,
					tmVenueId: selectedVenue.venue.tmVenueId,
					venueName: selectedVenue.label?.trim() || selectedVenue.venue.name,
					inserted: upserted.inserted,
					updated: upserted.updated,
					totalFetched: events.length,
					failed: false,
				});
			} catch (error) {
				console.error("Error syncing selected venue:", error);
				summaries.push({
					venueId: selectedVenue.venueId,
					tmVenueId: selectedVenue.venue.tmVenueId,
					venueName: selectedVenue.label?.trim() || selectedVenue.venue.name,
					inserted: 0,
					updated: 0,
					totalFetched: 0,
					failed: true,
					error: error instanceof Error ? error.message : "Sync failed",
				});
			}
		}

		return { venues: summaries };
	},
});

export const fetchTicketmasterEventsForVenue = action({
	args: {
		tmVenueId: v.string(),
		page: v.optional(v.number()),
		size: v.optional(v.number()),
	},
	handler: async (_ctx, args) => {
		const apiKey = getTicketmasterApiKey();
		const data = await fetchTicketmasterVenueEvents({
			apiKey,
			page: args.page ?? 0,
			size: args.size ?? DEFAULT_TICKETMASTER_PAGE_SIZE,
			venueId: args.tmVenueId,
		});

		return {
			events: normalizeTicketmasterEventsResponse(data),
			page: getTicketmasterPage(data),
		};
	},
});

async function fetchTicketmasterEvents({
	apiKey,
	page,
	size,
	geoPoint,
	postalCode,
	radius,
	venueId,
}: {
	apiKey: string;
	page: number;
	size: number;
	geoPoint?: string;
	postalCode?: string;
	radius?: string;
	venueId?: string;
}) {
	const url = buildTicketmasterEventSearchUrl({
		apiKey,
		geoPoint,
		page,
		postalCode,
		radius,
		size,
		startDateTime: formatTicketmasterDate(new Date()),
		venueId,
	});
	const response = await fetch(url.toString());
	const data = (await response.json()) as unknown;

	if (!response.ok) {
		throw new Error(`Ticketmaster request failed with ${response.status}`);
	}

	return data;
}

async function fetchTicketmasterVenueEvents({
	apiKey,
	page,
	size,
	venueId,
}: {
	apiKey: string;
	page: number;
	size: number;
	venueId: string;
}) {
	const url = buildTicketmasterVenueEventSearchUrl({
		apiKey,
		page,
		size,
		venueId,
	});
	const response = await fetch(url.toString());
	const data = (await response.json()) as unknown;

	if (!response.ok) {
		throw new Error(`Ticketmaster request failed with ${response.status}`);
	}

	return data;
}

function getTicketmasterLocationParams(
	postalCode: string,
):
	| { geoPoint: string; postalCode?: undefined }
	| { geoPoint?: undefined; postalCode: string } {
	// Ticketmaster appears to treat postalCode as an exact ZIP filter. For the
	// primary Denver search, use the 80209 geohash so radius actually expands.
	if (postalCode.trim() === "80209") {
		return { geoPoint: "9xj3gkn8e" };
	}

	return { postalCode };
}

function getTicketmasterApiKey(): string {
	const apiKey = process.env.TICKETMASTER_API_KEY;

	if (!apiKey) {
		throw new Error(
			"Missing TICKETMASTER_API_KEY in Convex environment variables.",
		);
	}

	return apiKey;
}
