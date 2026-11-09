import type { Infer } from "convex/values";
import { isI25Side } from "../../../src/lib/henry/units";
import type { henryUnitFactsValidator } from "./validators";

export const SIGHTMAP_URL =
	"https://sightmap.com/app/api/v1/960p7z7lw7n/sightmaps/13397";

export type HenryUnitFacts = Infer<typeof henryUnitFactsValidator>;

export type ParsedSightmap =
	| { ok: true; units: HenryUnitFacts[] }
	| { ok: false; reason: string };

const UNIT_FIELDS = [
	"id",
	"unit_number",
	"floor_id",
	"floor_plan_id",
	"area",
	"price",
	"total_price",
	"display_lease_term",
	"available_on",
	"specials_description",
] as const;
const FLOOR_FIELDS = ["id", "filter_label", "filter_short_label"] as const;
const FLOOR_PLAN_FIELDS = [
	"id",
	"name",
	"bedroom_count",
	"bathroom_count",
] as const;

/**
 * The response trimmed to the fields `parseSightmap` reads (the raw one is
 * ~850 KB, near Convex's 1 MB string limit). A projection only: it judges
 * nothing, so a body that isn't JSON comes back as a short excerpt for the
 * check to reject, and a missing or non-array list comes back as null.
 */
export function slimSightmapResponse(body: string): string {
	let json: unknown;
	try {
		json = JSON.parse(body);
	} catch {
		return body.slice(0, 2000);
	}
	const data = isRecord(json) && isRecord(json.data) ? json.data : {};
	return JSON.stringify({
		data: {
			units: pickEach(data.units, UNIT_FIELDS),
			floors: pickEach(data.floors, FLOOR_FIELDS),
			floor_plans: pickEach(data.floor_plans, FLOOR_PLAN_FIELDS),
		},
	});
}

/**
 * Reads every available unit from a SightMap response. Any unit it can't
 * read fails the whole response, so a broken payload changes nothing.
 */
export function parseSightmap(body: string): ParsedSightmap {
	let json: unknown;
	try {
		json = JSON.parse(body);
	} catch {
		return { ok: false, reason: "Not JSON" };
	}
	const data = isRecord(json) && isRecord(json.data) ? json.data : null;
	if (!data || !Array.isArray(data.units)) {
		return { ok: false, reason: "No units array" };
	}

	const floors = new Map<string, number>();
	for (const floor of asArray(data.floors)) {
		if (!isRecord(floor)) continue;
		const level = Number.parseInt(String(floor.filter_short_label), 10);
		if (typeof floor.id === "string" && Number.isFinite(level)) {
			floors.set(floor.id, level);
		}
	}

	const plans = new Map<
		string,
		{ name: string; beds: number; baths: number }
	>();
	for (const plan of asArray(data.floor_plans)) {
		if (!isRecord(plan) || typeof plan.id !== "string") continue;
		const name = floorPlanName(plan.name);
		if (
			name === null ||
			typeof plan.bedroom_count !== "number" ||
			typeof plan.bathroom_count !== "number"
		) {
			continue;
		}
		plans.set(plan.id, {
			name,
			beds: plan.bedroom_count,
			baths: plan.bathroom_count,
		});
	}

	const units: HenryUnitFacts[] = [];
	for (const raw of data.units) {
		const unit = parseUnit(raw, floors, plans);
		if (typeof unit === "string") return { ok: false, reason: unit };
		units.push(unit);
	}
	return { ok: true, units };
}

/** The unit, or why it can't be read. */
function parseUnit(
	raw: unknown,
	floors: Map<string, number>,
	plans: Map<string, { name: string; beds: number; baths: number }>,
): HenryUnitFacts | string {
	if (!isRecord(raw) || typeof raw.id !== "string" || raw.id === "") {
		return "A unit has no id";
	}
	const id = raw.id;
	function problem(what: string): string {
		return `Unit ${id}: ${what}`;
	}
	if (typeof raw.unit_number !== "string" || raw.unit_number === "") {
		return problem("no unit number");
	}
	const floor = floors.get(String(raw.floor_id));
	if (floor === undefined) return problem(`unknown floor ${raw.floor_id}`);
	const plan = plans.get(String(raw.floor_plan_id));
	if (!plan) return problem(`unknown floor plan ${raw.floor_plan_id}`);
	if (!isPositive(raw.price)) return problem("no price");
	if (!isPositive(raw.area)) return problem("no area");
	const totalPrice = Array.isArray(raw.total_price)
		? raw.total_price[0]
		: raw.total_price;
	if (!isPositive(totalPrice)) return problem("no total price");
	if (
		typeof raw.available_on !== "string" ||
		!/^\d{4}-\d{2}-\d{2}$/.test(raw.available_on)
	) {
		return problem("no available-on date");
	}
	const specials =
		typeof raw.specials_description === "string" &&
		raw.specials_description.trim() !== ""
			? raw.specials_description.trim()
			: null;

	return {
		sightmapId: raw.id,
		number: raw.unit_number,
		floor,
		floorPlan: plan.name,
		beds: plan.beds,
		baths: plan.baths,
		sqft: raw.area,
		facesI25: isI25Side(raw.unit_number),
		price: raw.price,
		totalPrice,
		leaseTermMonths: leaseTermMonths(raw.display_lease_term),
		availableOn: raw.available_on,
		specials,
	};
}

/** Floor plan names arrive as JSON strings: `{"name":"U1","provider_id":"37"}`. */
function floorPlanName(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (isRecord(parsed) && typeof parsed.name === "string") {
			return parsed.name;
		}
	} catch {
		// A plain name.
	}
	return raw.trim() === "" ? null : raw.trim();
}

/** "15 Months" → 15. */
function leaseTermMonths(raw: unknown): number | null {
	if (typeof raw !== "string") return null;
	const match = /(\d+)\s*month/i.exec(raw);
	return match ? Number(match[1]) : null;
}

function pickEach(
	list: unknown,
	fields: readonly string[],
): Record<string, unknown>[] | null {
	if (!Array.isArray(list)) return null;
	return list.map((item) =>
		isRecord(item)
			? Object.fromEntries(fields.map((field) => [field, item[field] ?? null]))
			: {},
	);
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function isPositive(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
