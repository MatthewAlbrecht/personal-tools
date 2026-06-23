import { fetchQuery } from "convex/nextjs";
import { type NextRequest, NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { renderConcertCalendar } from "../_ical";

const PRODUCT_ID = "moooose-concert-tracker";

export async function GET(request: NextRequest): Promise<NextResponse> {
	const token = request.nextUrl.searchParams.get("token");

	if (!token) {
		return new NextResponse("Missing calendar token", { status: 401 });
	}

	const result = await fetchQuery(api.concerts.getCalendarFeedByToken, {
		token,
	});

	if (!result) {
		return new NextResponse("Invalid calendar token", { status: 401 });
	}

	const body = renderConcertCalendar({
		productId: PRODUCT_ID,
		events: result.events.map(({ userEvent, event, venue }) => ({
			tmEventId: event.tmEventId,
			name: event.name,
			status: userEvent.userStatus === "owned" ? "owned" : "interested",
			dateTime: event.dateTime,
			localDate: event.localDate,
			url: event.url,
			venueName: venue.name,
			venueAddress: venue.address,
			venueCity: venue.city,
			venueStateCode: venue.stateCode,
		})),
	});

	return new NextResponse(body, {
		headers: {
			"Cache-Control": "private, max-age=300",
			"Content-Type": "text/calendar; charset=utf-8",
		},
	});
}
