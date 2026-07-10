import { createHash } from "node:crypto";

export function hashTrackUris(uris: string[]): string {
	return createHash("sha256").update(uris.join("\n")).digest("hex");
}
