import type { Doc } from "../../../../convex/_generated/dataModel";

export type ConcertUserStatus = "new" | "interested" | "owned" | "ignored";

export type TicketmasterVenue = {
	tmVenueId: string;
	name: string;
	city?: string;
	stateCode?: string;
	address?: string;
	postalCode?: string;
	latitude?: number;
	longitude?: number;
	eventCount?: number;
};

export type TicketmasterEvent = {
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
	venue: TicketmasterVenue;
};

export type ConcertEventRow = Doc<"userConcertEvents"> & {
	event: Doc<"concertEvents">;
	venue: Doc<"concertVenues">;
};

export type SelectedConcertVenueRow = Doc<"userConcertVenues"> & {
	venue: Doc<"concertVenues">;
};

export type TicketmasterPage = {
	size?: number;
	totalElements?: number;
	totalPages?: number;
	number?: number;
};

export type EventSearchLoadResult = {
	events: TicketmasterEvent[];
	page?: TicketmasterPage;
	upserted: {
		inserted: number;
		updated: number;
		total: number;
	};
};

export type ConcertSyncVenueSummary = {
	venueId: Doc<"concertVenues">["_id"];
	tmVenueId: string;
	venueName: string;
	inserted: number;
	updated: number;
	totalFetched: number;
	failed: boolean;
	error?: string;
};
