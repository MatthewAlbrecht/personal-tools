import { ConvexError } from "convex/values";

/** The message a Convex mutation threw on purpose, or the fallback for anything else. */
export function errorMessage(error: unknown, fallback: string): string {
	if (error instanceof ConvexError && typeof error.data === "string") {
		return error.data;
	}
	return fallback;
}
