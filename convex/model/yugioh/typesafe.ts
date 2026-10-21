import { TypeSafeClient } from "@typesafe-ai/sdk";

/** Thrown before any call when this deployment has no TypeSafe key. */
export class TypesafeKeyMissingError extends Error {
	constructor() {
		super(
			"TYPESAFE_API_KEY isn't set on this Convex deployment. Set it with `npx convex env set TYPESAFE_API_KEY <key>`.",
		);
		this.name = "TypesafeKeyMissingError";
	}
}

/** The TypeSafe client, keyed from Convex env. Throws when the key is unset. */
export function typesafeClient(): TypeSafeClient {
	const apiKey = process.env.TYPESAFE_API_KEY;
	if (!apiKey) throw new TypesafeKeyMissingError();
	// The Convex runtime has no zstd, so send requests uncompressed.
	return new TypeSafeClient({ apiKey, compression: false });
}
