import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireAuth } from "./auth";

const entryPointValidator = v.union(
	v.literal("month"),
	v.literal("week"),
	v.literal("day_before"),
	v.literal("day_of"),
);

const birthdayDocValidator = v.object({
	_id: v.id("birthdays"),
	_creationTime: v.number(),
	userId: v.string(),
	name: v.string(),
	month: v.number(),
	day: v.number(),
	birthYear: v.optional(v.number()),
	entryPoint: entryPointValidator,
	createdAt: v.number(),
	updatedAt: v.number(),
});

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function assertValidBirthdayDate(month: number, day: number): void {
	if (!Number.isInteger(month) || month < 1 || month > 12) {
		throw new Error("Invalid birthday month");
	}
	if (!Number.isInteger(day) || day < 1) {
		throw new Error("Invalid birthday day");
	}
	const maxDay = month === 2 ? 29 : (DAYS_IN_MONTH[month - 1] ?? 0);
	if (day > maxDay) {
		throw new Error("Invalid birthday date");
	}
}

export const list = query({
	args: { userId: v.string() },
	returns: v.array(birthdayDocValidator),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await ctx.db
			.query("birthdays")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect();
	},
});

export const listForReminders = query({
	args: { userId: v.string() },
	returns: v.array(birthdayDocValidator),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		return await ctx.db
			.query("birthdays")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect();
	},
});

export const create = mutation({
	args: {
		userId: v.string(),
		name: v.string(),
		month: v.number(),
		day: v.number(),
		birthYear: v.optional(v.number()),
		entryPoint: entryPointValidator,
	},
	returns: v.id("birthdays"),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		assertValidBirthdayDate(args.month, args.day);
		const trimmed = args.name.trim();
		if (!trimmed) throw new Error("Name is required");
		const now = Date.now();
		return await ctx.db.insert("birthdays", {
			userId: args.userId,
			name: trimmed,
			month: args.month,
			day: args.day,
			birthYear: args.birthYear,
			entryPoint: args.entryPoint,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const update = mutation({
	args: {
		id: v.id("birthdays"),
		userId: v.string(),
		name: v.string(),
		month: v.number(),
		day: v.number(),
		birthYear: v.optional(v.number()),
		entryPoint: entryPointValidator,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		assertValidBirthdayDate(args.month, args.day);
		const existing = await ctx.db.get(args.id);
		if (!existing || existing.userId !== args.userId) {
			throw new Error("Birthday not found");
		}
		const trimmed = args.name.trim();
		if (!trimmed) throw new Error("Name is required");
		await ctx.db.patch(args.id, {
			name: trimmed,
			month: args.month,
			day: args.day,
			birthYear: args.birthYear,
			entryPoint: args.entryPoint,
			updatedAt: Date.now(),
		});
		return null;
	},
});

export const remove = mutation({
	args: {
		id: v.id("birthdays"),
		userId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const existing = await ctx.db.get(args.id);
		if (!existing || existing.userId !== args.userId) {
			throw new Error("Birthday not found");
		}
		await ctx.db.delete(args.id);
		return null;
	},
});

const deliveryKeyValidator = v.object({
	birthdayId: v.id("birthdays"),
	occurrenceYear: v.number(),
	step: entryPointValidator,
});

export const filterUndelivered = query({
	args: {
		keys: v.array(deliveryKeyValidator),
	},
	returns: v.array(deliveryKeyValidator),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const undelivered: Array<{
			birthdayId: Id<"birthdays">;
			occurrenceYear: number;
			step: "month" | "week" | "day_before" | "day_of";
		}> = [];

		for (const key of args.keys) {
			const existing = await ctx.db
				.query("birthdayReminderDeliveries")
				.withIndex("by_birthday_year_step", (q) =>
					q
						.eq("birthdayId", key.birthdayId)
						.eq("occurrenceYear", key.occurrenceYear)
						.eq("step", key.step),
				)
				.first();
			if (!existing) {
				undelivered.push(key);
			}
		}
		return undelivered;
	},
});

export const recordDeliveries = mutation({
	args: {
		userId: v.string(),
		items: v.array(deliveryKeyValidator),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		requireAuth(ctx);
		const sentAt = Date.now();
		for (const item of args.items) {
			const existing = await ctx.db
				.query("birthdayReminderDeliveries")
				.withIndex("by_birthday_year_step", (q) =>
					q
						.eq("birthdayId", item.birthdayId)
						.eq("occurrenceYear", item.occurrenceYear)
						.eq("step", item.step),
				)
				.first();
			if (existing) continue;
			await ctx.db.insert("birthdayReminderDeliveries", {
				userId: args.userId,
				birthdayId: item.birthdayId,
				occurrenceYear: item.occurrenceYear,
				step: item.step,
				sentAt,
			});
		}
		return null;
	},
});
