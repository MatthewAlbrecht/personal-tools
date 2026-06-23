import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
	areConcertDatesInSameRun,
	cleanConcertEventNameForDisplay,
	getBestConcertEventName,
	getConcertDateRange,
	getConcertEventDate,
	getConcertEventDedupeParts,
	getInitialConcertEventDedupeKey,
	getStrongerConcertStatus,
	mergeConcertEventDates,
	mergeTicketmasterEventIds,
} from "./_utils/concertEventDedupe";

const concertEventStatusValidator = v.union(
	v.literal("new"),
	v.literal("interested"),
	v.literal("owned"),
	v.literal("ignored"),
);

type ConcertEventStatus = "new" | "interested" | "owned" | "ignored";
type StoredConcertEventRow = {
	dedupeParts: ReturnType<typeof getConcertEventDedupeParts>;
	event: Doc<"concertEvents">;
	venue: Doc<"concertVenues">;
};

const ticketmasterVenueValidator = v.object({
	tmVenueId: v.string(),
	name: v.string(),
	city: v.optional(v.string()),
	stateCode: v.optional(v.string()),
	address: v.optional(v.string()),
	postalCode: v.optional(v.string()),
	latitude: v.optional(v.number()),
	longitude: v.optional(v.number()),
});

const ticketmasterEventValidator = v.object({
	tmEventId: v.string(),
	name: v.string(),
	url: v.optional(v.string()),
	imageUrl: v.optional(v.string()),
	localDate: v.optional(v.string()),
	localTime: v.optional(v.string()),
	dateTime: v.optional(v.string()),
	tmStatus: v.optional(v.string()),
	publicSaleStartDateTime: v.optional(v.string()),
	attractionNames: v.array(v.string()),
	venue: ticketmasterVenueValidator,
});

export const listSelectedVenues = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		const rows = await ctx.db
			.query("userConcertVenues")
			.withIndex("by_userId_isSelected", (q) =>
				q.eq("userId", args.userId).eq("isSelected", true),
			)
			.collect();

		const venues = await Promise.all(
			rows.map(async (row) => {
				const venue = await ctx.db.get(row.venueId);
				return venue ? { ...row, venue } : null;
			}),
		);

		return venues.filter((venue) => venue !== null);
	},
});

export const listUserEvents = query({
	args: {
		userId: v.string(),
		status: v.optional(concertEventStatusValidator),
	},
	handler: async (ctx, args) => {
		const rows =
			args.status !== undefined
				? await listUserEventsByStatus(ctx, args.userId, args.status)
				: await ctx.db
						.query("userConcertEvents")
						.withIndex("by_userId", (q) => q.eq("userId", args.userId))
						.collect();

		const events = await Promise.all(
			rows.map(async (row) => {
				const event = await ctx.db.get(row.eventId);
				if (!event) return null;

				const venue = await ctx.db.get(event.venueId);
				return venue ? { ...row, event, venue } : null;
			}),
		);

		return events
			.filter((event) => event !== null)
			.sort((a, b) =>
				(a.event.dateTime ?? a.event.localDate ?? "").localeCompare(
					b.event.dateTime ?? b.event.localDate ?? "",
				),
			);
	},
});

export const listUpcomingShows = query({
	args: {
		userId: v.string(),
		todayDate: v.string(),
		includeInterested: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const statuses: ConcertEventStatus[] = args.includeInterested
			? ["owned", "interested"]
			: ["owned"];
		const rows = await listUserEventsByStatusesSinceDate(
			ctx,
			args.userId,
			statuses,
			args.todayDate,
		);

		return await hydrateAndSortUserConcertEvents(ctx, rows);
	},
});

export const listNewShows = query({
	args: {
		userId: v.string(),
		todayDate: v.string(),
		venueIds: v.optional(v.array(v.id("concertVenues"))),
		includeActioned: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const statuses: ConcertEventStatus[] = args.includeActioned
			? ["new", "interested", "owned", "ignored"]
			: ["new"];
		const venueIds = args.venueIds?.filter(Boolean) ?? [];
		const rows =
			venueIds.length > 0
				? await listUserEventsByVenueStatusesSinceDate(
						ctx,
						args.userId,
						venueIds,
						statuses,
						args.todayDate,
					)
				: await listUserEventsByStatusesSinceDate(
						ctx,
						args.userId,
						statuses,
						args.todayDate,
					);

		return await hydrateAndSortUserConcertEvents(ctx, rows);
	},
});

export const upsertVenueFromTicketmaster = mutation({
	args: {
		userId: v.string(),
		venue: ticketmasterVenueValidator,
		isSelected: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const venueId = await upsertConcertVenue(ctx, args.venue, now);

		const existingUserVenue = await ctx.db
			.query("userConcertVenues")
			.withIndex("by_userId_venueId", (q) =>
				q.eq("userId", args.userId).eq("venueId", venueId),
			)
			.first();

		if (existingUserVenue) {
			await ctx.db.patch(existingUserVenue._id, {
				isSelected: args.isSelected ?? existingUserVenue.isSelected,
				updatedAt: now,
			});
			return { venueId, userVenueId: existingUserVenue._id, inserted: false };
		}

		const userVenueId = await ctx.db.insert("userConcertVenues", {
			userId: args.userId,
			venueId,
			isSelected: args.isSelected ?? true,
			createdAt: now,
			updatedAt: now,
		});

		return { venueId, userVenueId, inserted: true };
	},
});

export const setVenueSelected = mutation({
	args: {
		userId: v.string(),
		venueId: v.id("concertVenues"),
		isSelected: v.boolean(),
	},
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query("userConcertVenues")
			.withIndex("by_userId_venueId", (q) =>
				q.eq("userId", args.userId).eq("venueId", args.venueId),
			)
			.first();

		if (!row) {
			throw new Error("Selected venue row not found");
		}

		await ctx.db.patch(row._id, {
			isSelected: args.isSelected,
			updatedAt: Date.now(),
		});
	},
});

export const updateUserVenueLabel = mutation({
	args: {
		userId: v.string(),
		venueId: v.id("concertVenues"),
		label: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query("userConcertVenues")
			.withIndex("by_userId_venueId", (q) =>
				q.eq("userId", args.userId).eq("venueId", args.venueId),
			)
			.first();

		if (!row) {
			throw new Error("Selected venue row not found");
		}

		const label = args.label?.trim() || undefined;

		await ctx.db.patch(row._id, {
			label,
			updatedAt: Date.now(),
		});
	},
});

export const upsertEventsFromTicketmaster = mutation({
	args: {
		userId: v.string(),
		events: v.array(ticketmasterEventValidator),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		let inserted = 0;
		let updated = 0;

		for (const event of args.events) {
			const venueId = await upsertConcertVenue(ctx, event.venue, now);
			const dedupeParts = getConcertEventDedupeParts({
				event,
				tmVenueId: event.venue.tmVenueId,
			});
			const existingEvent = await findCanonicalConcertEvent(
				ctx,
				dedupeParts,
				event.tmEventId,
				venueId,
				event.venue.tmVenueId,
			);
			const eventPatch = buildConcertEventPatch({
				dedupeParts,
				event,
				existingEvent,
				now,
				venueId,
			});

			const eventId = existingEvent
				? existingEvent._id
				: await ctx.db.insert("concertEvents", {
						firstSeenAt: now,
						...eventPatch,
					});

			if (existingEvent) {
				await ctx.db.patch(existingEvent._id, eventPatch);
				updated++;
			} else {
				inserted++;
			}

			await ensureUserConcertEvent(
				ctx,
				args.userId,
				eventId,
				now,
				getUserConcertEventQueryFields(eventPatch),
			);
		}

		return { inserted, updated, total: args.events.length };
	},
});

export const collapseDuplicateConcertEvents = mutation({
	args: {
		confirmation: v.optional(v.string()),
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const events = await ctx.db.query("concertEvents").collect();
		const rows = (
			await Promise.all(
				events.map(async (event) => {
					const venue = await ctx.db.get(event.venueId);
					if (!venue) return null;

					return {
						dedupeParts: getConcertEventDedupeParts({
							event,
							tmVenueId: venue.tmVenueId,
						}),
						event,
						venue,
					};
				}),
			)
		).filter((row): row is StoredConcertEventRow => row !== null);

		const duplicateGroups = getExistingConcertEventDuplicateGroups(rows);

		if (args.dryRun) {
			return {
				deletedEvents: 0,
				duplicateGroups: duplicateGroups.length,
				mergedUserEvents: 0,
			};
		}

		if (args.confirmation !== "collapse-duplicates") {
			throw new Error("Pass confirmation: collapse-duplicates to mutate data.");
		}

		let deletedEvents = 0;
		let mergedUserEvents = 0;

		for (const group of duplicateGroups) {
			const representative = getRepresentativeStoredEventRow(group);
			const duplicateEventIds = group
				.map((row) => row.event._id)
				.filter((eventId) => eventId !== representative.event._id);

			await ctx.db.patch(
				representative.event._id,
				buildMergedStoredConcertEventPatch(group, representative),
			);

			mergedUserEvents += await mergeUserConcertEventRows(
				ctx,
				representative.event._id,
				group.map((row) => row.event._id),
			);

			for (const eventId of duplicateEventIds) {
				await ctx.db.delete(eventId);
				deletedEvents++;
			}
		}

		return {
			deletedEvents,
			duplicateGroups: duplicateGroups.length,
			mergedUserEvents,
		};
	},
});

export const updateEventUserStatus = mutation({
	args: {
		userId: v.string(),
		eventId: v.id("concertEvents"),
		userStatus: concertEventStatusValidator,
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query("userConcertEvents")
			.withIndex("by_userId_eventId", (q) =>
				q.eq("userId", args.userId).eq("eventId", args.eventId),
			)
			.first();

		if (!row) {
			throw new Error("Concert event row not found for user");
		}

		await ctx.db.patch(row._id, {
			userStatus: args.userStatus,
			notes: args.notes,
			updatedAt: Date.now(),
		});
	},
});

export const backfillUserConcertEventQueryFields = mutation({
	args: {
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const rows = await ctx.db.query("userConcertEvents").collect();
		let checked = 0;
		let missingEvents = 0;
		let patched = 0;

		for (const row of rows) {
			checked++;
			const event = await ctx.db.get(row.eventId);

			if (!event) {
				missingEvents++;
				continue;
			}

			const queryFields = getUserConcertEventQueryFields(event);

			if (
				row.venueId === queryFields.venueId &&
				row.eventDate === queryFields.eventDate
			) {
				continue;
			}

			patched++;

			if (!args.dryRun) {
				await ctx.db.patch(row._id, queryFields);
			}
		}

		return {
			checked,
			missingEvents,
			patched,
			dryRun: args.dryRun ?? false,
		};
	},
});

export const getCalendarFeedByToken = query({
	args: { token: v.string() },
	handler: async (ctx, args) => {
		const feed = await ctx.db
			.query("concertCalendarFeeds")
			.withIndex("by_token", (q) => q.eq("token", args.token))
			.first();

		if (!feed || feed.revokedAt) return null;

		const rows = await ctx.db
			.query("userConcertEvents")
			.withIndex("by_userId", (q) => q.eq("userId", feed.userId))
			.collect();

		const calendarRows = rows.filter(
			(row) => row.userStatus === "interested" || row.userStatus === "owned",
		);

		const events = await Promise.all(
			calendarRows.map(async (row) => {
				const event = await ctx.db.get(row.eventId);
				if (!event) return null;

				const venue = await ctx.db.get(event.venueId);
				return venue ? { userEvent: row, event, venue } : null;
			}),
		);

		return { feed, events: events.filter((event) => event !== null) };
	},
});

export const getCalendarFeedForUser = query({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("concertCalendarFeeds")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.first();
	},
});

export const upsertCalendarFeed = mutation({
	args: { userId: v.string(), token: v.string() },
	handler: async (ctx, args) => {
		const now = Date.now();
		const existing = await ctx.db
			.query("concertCalendarFeeds")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				token: args.token,
				updatedAt: now,
				revokedAt: undefined,
			});
			return existing._id;
		}

		return await ctx.db.insert("concertCalendarFeeds", {
			userId: args.userId,
			token: args.token,
			createdAt: now,
			updatedAt: now,
		});
	},
});

async function findCanonicalConcertEvent(
	ctx: MutationCtx,
	dedupeParts: ReturnType<typeof getConcertEventDedupeParts>,
	tmEventId: string,
	venueId: Id<"concertVenues">,
	tmVenueId: string,
): Promise<Doc<"concertEvents"> | null> {
	const candidates = await ctx.db
		.query("concertEvents")
		.withIndex("by_dedupeBaseKey", (q) =>
			q.eq("dedupeBaseKey", dedupeParts.baseKey),
		)
		.collect();

	const sourceMatch = candidates.find((event) =>
		getStoredTicketmasterEventIds(event).includes(tmEventId),
	);

	if (sourceMatch) return sourceMatch;

	const dateRunMatch = candidates.find((event) =>
		areConcertDatesInSameRun(
			getStoredConcertEventDates(event),
			dedupeParts.eventDate,
		),
	);

	if (dateRunMatch) return dateRunMatch;

	const tmEventMatch = await ctx.db
		.query("concertEvents")
		.withIndex("by_tmEventId", (q) => q.eq("tmEventId", tmEventId))
		.first();

	if (tmEventMatch) return tmEventMatch;

	const legacyCandidates = await ctx.db
		.query("concertEvents")
		.withIndex("by_venueId", (q) => q.eq("venueId", venueId))
		.collect();

	return (
		legacyCandidates.find((event) => {
			const legacyParts = getConcertEventDedupeParts({
				event,
				tmVenueId,
			});

			return (
				legacyParts.baseKey === dedupeParts.baseKey &&
				areConcertDatesInSameRun(
					getStoredConcertEventDates(event),
					dedupeParts.eventDate,
				)
			);
		}) ?? null
	);
}

function buildConcertEventPatch({
	dedupeParts,
	event,
	existingEvent,
	now,
	venueId,
}: {
	dedupeParts: ReturnType<typeof getConcertEventDedupeParts>;
	event: {
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
	};
	existingEvent: Doc<"concertEvents"> | null;
	now: number;
	venueId: Id<"concertVenues">;
}) {
	const existingDates = existingEvent
		? getStoredConcertEventDates(existingEvent)
		: [];
	const eventDates = mergeConcertEventDates(
		existingDates,
		dedupeParts.eventDate,
	);
	const { dateRangeEnd, dateRangeStart } = getConcertDateRange(eventDates);
	const existingTmEventIds = existingEvent
		? getStoredTicketmasterEventIds(existingEvent)
		: [];
	const tmEventIds = mergeTicketmasterEventIds([
		...existingTmEventIds,
		event.tmEventId,
	]);
	const bestName = getBestConcertEventName([
		...(existingEvent ? [existingEvent.name] : []),
		event.name,
	]);
	const useIncomingRepresentative =
		!existingEvent ||
		bestName === event.name ||
		isIncomingEventEarlier(existingEvent, dedupeParts.eventDate);

	return {
		tmEventId: useIncomingRepresentative
			? event.tmEventId
			: (existingEvent?.tmEventId ?? event.tmEventId),
		tmEventIds,
		dedupeKey:
			existingEvent?.dedupeKey ?? getInitialConcertEventDedupeKey(dedupeParts),
		dedupeBaseKey: dedupeParts.baseKey,
		venueId,
		name: cleanConcertEventNameForDisplay(bestName || event.name),
		url: useIncomingRepresentative
			? event.url
			: (existingEvent?.url ?? event.url),
		imageUrl: useIncomingRepresentative
			? event.imageUrl
			: (existingEvent?.imageUrl ?? event.imageUrl),
		localDate: useIncomingRepresentative
			? event.localDate
			: (existingEvent?.localDate ?? event.localDate),
		localTime: useIncomingRepresentative
			? event.localTime
			: (existingEvent?.localTime ?? event.localTime),
		dateTime: useIncomingRepresentative
			? event.dateTime
			: (existingEvent?.dateTime ?? event.dateTime),
		tmStatus: event.tmStatus ?? existingEvent?.tmStatus,
		publicSaleStartDateTime:
			event.publicSaleStartDateTime ?? existingEvent?.publicSaleStartDateTime,
		attractionNames: mergeTicketmasterEventIds([
			...(existingEvent?.attractionNames ?? []),
			...event.attractionNames,
		]),
		eventDates,
		dateRangeStart,
		dateRangeEnd,
		lastSeenAt: now,
		lastFetchedAt: now,
	};
}

async function ensureUserConcertEvent(
	ctx: MutationCtx,
	userId: string,
	eventId: Id<"concertEvents">,
	now: number,
	queryFields: {
		venueId: Id<"concertVenues">;
		eventDate?: string;
	},
): Promise<void> {
	const existingUserEvent = await ctx.db
		.query("userConcertEvents")
		.withIndex("by_userId_eventId", (q) =>
			q.eq("userId", userId).eq("eventId", eventId),
		)
		.first();

	if (existingUserEvent) {
		if (
			existingUserEvent.venueId !== queryFields.venueId ||
			existingUserEvent.eventDate !== queryFields.eventDate
		) {
			await ctx.db.patch(existingUserEvent._id, queryFields);
		}
		return;
	}

	await ctx.db.insert("userConcertEvents", {
		userId,
		eventId,
		...queryFields,
		userStatus: "new",
		firstSeenAt: now,
		updatedAt: now,
	});
}

function getStoredTicketmasterEventIds(event: Doc<"concertEvents">): string[] {
	return mergeTicketmasterEventIds([
		event.tmEventId,
		...(event.tmEventIds ?? []),
	]);
}

function getUserConcertEventQueryFields(event: {
	venueId: Id<"concertVenues">;
	dateRangeStart?: string;
	localDate?: string;
	dateTime?: string;
}): {
	venueId: Id<"concertVenues">;
	eventDate?: string;
} {
	return {
		venueId: event.venueId,
		eventDate: getConcertEventDateKey(event),
	};
}

function getConcertEventDateKey(event: {
	dateRangeStart?: string;
	localDate?: string;
	dateTime?: string;
}): string | undefined {
	return (
		event.dateRangeStart ?? event.localDate ?? event.dateTime?.slice(0, 10)
	);
}

function getStoredConcertEventDates(event: Doc<"concertEvents">): string[] {
	return mergeConcertEventDates(
		event.eventDates ?? [],
		getConcertEventDate(event),
	);
}

function isIncomingEventEarlier(
	existingEvent: Doc<"concertEvents">,
	incomingDate: string | undefined,
): boolean {
	const currentStartDate =
		existingEvent.dateRangeStart ?? getConcertEventDate(existingEvent);

	return Boolean(
		incomingDate && currentStartDate && incomingDate < currentStartDate,
	);
}

function getExistingConcertEventDuplicateGroups(
	rows: StoredConcertEventRow[],
): StoredConcertEventRow[][] {
	const rowsByBaseKey = new Map<string, StoredConcertEventRow[]>();

	for (const row of rows) {
		rowsByBaseKey.set(row.dedupeParts.baseKey, [
			...(rowsByBaseKey.get(row.dedupeParts.baseKey) ?? []),
			row,
		]);
	}

	return Array.from(rowsByBaseKey.values())
		.flatMap((baseRows) => groupStoredRowsIntoDateRuns(baseRows))
		.filter((group) => group.length > 1);
}

function groupStoredRowsIntoDateRuns(
	rows: StoredConcertEventRow[],
): StoredConcertEventRow[][] {
	const sortedRows = [...rows].sort(compareStoredEventRows);
	const groups: StoredConcertEventRow[][] = [];

	for (const row of sortedRows) {
		const currentGroup = groups[groups.length - 1];
		const rowDates = getStoredConcertEventDates(row.event);

		if (
			currentGroup &&
			rowDates.some((rowDate) =>
				areConcertDatesInSameRun(
					getGroupStoredEventDates(currentGroup),
					rowDate,
				),
			)
		) {
			currentGroup.push(row);
			continue;
		}

		groups.push([row]);
	}

	return groups;
}

function getRepresentativeStoredEventRow(
	rows: StoredConcertEventRow[],
): StoredConcertEventRow {
	const [representative] = [...rows].sort((a, b) => {
		const bestName = getBestConcertEventName([a.event.name, b.event.name]);
		if (bestName === a.event.name && bestName !== b.event.name) return -1;
		if (bestName === b.event.name && bestName !== a.event.name) return 1;
		return compareStoredEventRows(a, b);
	});

	if (!representative) {
		throw new Error("Expected at least one stored concert event row");
	}

	return representative;
}

function buildMergedStoredConcertEventPatch(
	rows: StoredConcertEventRow[],
	representative: StoredConcertEventRow,
) {
	const eventDates = getGroupStoredEventDates(rows);
	const { dateRangeEnd, dateRangeStart } = getConcertDateRange(eventDates);
	const tmEventIds = mergeTicketmasterEventIds(
		rows.flatMap((row) => getStoredTicketmasterEventIds(row.event)),
	);
	const attractionNames = mergeTicketmasterEventIds(
		rows.flatMap((row) => row.event.attractionNames),
	);
	const bestName = getBestConcertEventName(rows.map((row) => row.event.name));
	const firstSeenAt = Math.min(...rows.map((row) => row.event.firstSeenAt));
	const lastSeenAt = Math.max(...rows.map((row) => row.event.lastSeenAt));
	const lastFetchedAt = Math.max(...rows.map((row) => row.event.lastFetchedAt));

	return {
		tmEventId: representative.event.tmEventId,
		tmEventIds,
		dedupeKey:
			representative.event.dedupeKey ??
			getInitialConcertEventDedupeKey({
				baseKey: representative.dedupeParts.baseKey,
				eventDate: dateRangeStart,
			}),
		dedupeBaseKey: representative.dedupeParts.baseKey,
		venueId: representative.event.venueId,
		name: cleanConcertEventNameForDisplay(
			bestName || representative.event.name,
		),
		url: representative.event.url,
		imageUrl: representative.event.imageUrl,
		localDate: representative.event.localDate,
		localTime: representative.event.localTime,
		dateTime: representative.event.dateTime,
		tmStatus: representative.event.tmStatus,
		publicSaleStartDateTime: representative.event.publicSaleStartDateTime,
		attractionNames,
		eventDates,
		dateRangeStart,
		dateRangeEnd,
		firstSeenAt,
		lastSeenAt,
		lastFetchedAt,
	};
}

async function mergeUserConcertEventRows(
	ctx: MutationCtx,
	canonicalEventId: Id<"concertEvents">,
	eventIds: Id<"concertEvents">[],
): Promise<number> {
	const canonicalEvent = await ctx.db.get(canonicalEventId);

	if (!canonicalEvent) {
		throw new Error("Canonical concert event not found");
	}

	const queryFields = getUserConcertEventQueryFields(canonicalEvent);
	const userRows = (
		await Promise.all(
			eventIds.map(async (eventId) => {
				return await ctx.db
					.query("userConcertEvents")
					.withIndex("by_eventId", (q) => q.eq("eventId", eventId))
					.collect();
			}),
		)
	).flat();
	const rowsByUserId = new Map<string, Doc<"userConcertEvents">[]>();
	let mergedRows = 0;

	for (const row of userRows) {
		rowsByUserId.set(row.userId, [
			...(rowsByUserId.get(row.userId) ?? []),
			row,
		]);
	}

	for (const rows of rowsByUserId.values()) {
		const firstRow = rows[0];
		if (!firstRow) continue;

		const canonicalUserRow = rows.find(
			(row) => row.eventId === canonicalEventId,
		);
		const strongestStatus = rows.reduce<ConcertEventStatus>(
			(status, row) => getStrongerConcertStatus(status, row.userStatus),
			firstRow.userStatus,
		);
		const firstSeenAt = Math.min(...rows.map((row) => row.firstSeenAt));
		const updatedAt = Math.max(...rows.map((row) => row.updatedAt));
		const notes = rows.find((row) => row.notes)?.notes;

		if (canonicalUserRow) {
			await ctx.db.patch(canonicalUserRow._id, {
				eventId: canonicalEventId,
				firstSeenAt,
				notes,
				...queryFields,
				updatedAt,
				userStatus: strongestStatus,
			});
		} else {
			await ctx.db.insert("userConcertEvents", {
				eventId: canonicalEventId,
				firstSeenAt,
				notes,
				...queryFields,
				updatedAt,
				userId: firstRow.userId,
				userStatus: strongestStatus,
			});
		}

		for (const row of rows) {
			if (row._id === canonicalUserRow?._id) continue;
			await ctx.db.delete(row._id);
			mergedRows++;
		}
	}

	return mergedRows;
}

function getGroupStoredEventDates(rows: StoredConcertEventRow[]): string[] {
	return mergeConcertEventDates(
		rows.flatMap((row) => getStoredConcertEventDates(row.event)),
		undefined,
	);
}

function compareStoredEventRows(
	a: StoredConcertEventRow,
	b: StoredConcertEventRow,
): number {
	return (
		(getStoredConcertEventStartDate(a.event) ?? "").localeCompare(
			getStoredConcertEventStartDate(b.event) ?? "",
		) || a.event.name.localeCompare(b.event.name)
	);
}

function getStoredConcertEventStartDate(
	event: Doc<"concertEvents">,
): string | undefined {
	return event.dateRangeStart ?? getConcertEventDate(event);
}

async function upsertConcertVenue(
	ctx: MutationCtx,
	venue: {
		tmVenueId: string;
		name: string;
		city?: string;
		stateCode?: string;
		address?: string;
		postalCode?: string;
		latitude?: number;
		longitude?: number;
	},
	now: number,
) {
	const existing = await ctx.db
		.query("concertVenues")
		.withIndex("by_tmVenueId", (q) => q.eq("tmVenueId", venue.tmVenueId))
		.first();

	if (existing) {
		await ctx.db.patch(existing._id, {
			...venue,
			lastSeenAt: now,
			lastFetchedAt: now,
		});
		return existing._id;
	}

	return await ctx.db.insert("concertVenues", {
		...venue,
		firstSeenAt: now,
		lastSeenAt: now,
		lastFetchedAt: now,
	});
}

async function listUserEventsByStatus(
	ctx: QueryCtx,
	userId: string,
	status: "new" | "interested" | "owned" | "ignored",
) {
	return await ctx.db
		.query("userConcertEvents")
		.withIndex("by_userId_userStatus", (q) =>
			q.eq("userId", userId).eq("userStatus", status),
		)
		.collect();
}

async function listUserEventsByStatusesSinceDate(
	ctx: QueryCtx,
	userId: string,
	statuses: ConcertEventStatus[],
	todayDate: string,
): Promise<Doc<"userConcertEvents">[]> {
	return (
		await Promise.all(
			statuses.map(async (status) => {
				return await ctx.db
					.query("userConcertEvents")
					.withIndex("by_userId_userStatus_eventDate", (q) =>
						q
							.eq("userId", userId)
							.eq("userStatus", status)
							.gte("eventDate", todayDate),
					)
					.collect();
			}),
		)
	).flat();
}

async function listUserEventsByVenueStatusesSinceDate(
	ctx: QueryCtx,
	userId: string,
	venueIds: Id<"concertVenues">[],
	statuses: ConcertEventStatus[],
	todayDate: string,
): Promise<Doc<"userConcertEvents">[]> {
	const rows = (
		await Promise.all(
			venueIds.flatMap((venueId) =>
				statuses.map(async (status) => {
					return await ctx.db
						.query("userConcertEvents")
						.withIndex("by_userId_venueId_userStatus_eventDate", (q) =>
							q
								.eq("userId", userId)
								.eq("venueId", venueId)
								.eq("userStatus", status)
								.gte("eventDate", todayDate),
						)
						.collect();
				}),
			),
		)
	).flat();
	const rowsById = new Map(rows.map((row) => [row._id, row]));

	return [...rowsById.values()];
}

async function hydrateAndSortUserConcertEvents(
	ctx: QueryCtx,
	rows: Doc<"userConcertEvents">[],
) {
	const hydratedRows = await Promise.all(
		rows.map(async (row) => {
			const event = await ctx.db.get(row.eventId);
			if (!event) return null;

			const venue = await ctx.db.get(event.venueId);
			return venue ? { ...row, event, venue } : null;
		}),
	);

	return hydratedRows
		.filter((row) => row !== null)
		.sort(
			(a, b) =>
				(a.eventDate ?? getConcertEventDateKey(a.event) ?? "").localeCompare(
					b.eventDate ?? getConcertEventDateKey(b.event) ?? "",
				) || a.event.name.localeCompare(b.event.name),
		);
}
