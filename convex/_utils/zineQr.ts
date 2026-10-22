import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Back-cover QR fields shared by `geniusAlbums` and `playlistLyrics`. */
export type ZineQrFields = {
	zineSpotifyQrStorageId?: Id<"_storage">;
	zineSpotifyQrImageUrl?: string;
	zineAppleMusicQrStorageId?: Id<"_storage">;
	zineAppleMusicQrImageUrl?: string;
	zineShowSpotifyQr?: boolean;
	zineShowAppleMusicQr?: boolean;
};

export type ZineQrService = "spotify" | "appleMusic";

const QR_FIELDS = {
	spotify: {
		storage: "zineSpotifyQrStorageId",
		url: "zineSpotifyQrImageUrl",
	},
	appleMusic: {
		storage: "zineAppleMusicQrStorageId",
		url: "zineAppleMusicQrImageUrl",
	},
} as const;

export async function resolveZineQrImageUrls(
	ctx: Pick<QueryCtx | MutationCtx, "storage">,
	doc: ZineQrFields,
): Promise<{
	zineSpotifyQrImageUrl?: string;
	zineAppleMusicQrImageUrl?: string;
}> {
	const [zineSpotifyQrImageUrl, zineAppleMusicQrImageUrl] = await Promise.all([
		resolveZineQrImageUrl(ctx, doc, "spotify"),
		resolveZineQrImageUrl(ctx, doc, "appleMusic"),
	]);
	return { zineSpotifyQrImageUrl, zineAppleMusicQrImageUrl };
}

async function resolveZineQrImageUrl(
	ctx: Pick<QueryCtx | MutationCtx, "storage">,
	doc: ZineQrFields,
	service: ZineQrService,
): Promise<string | undefined> {
	const storageId = doc[QR_FIELDS[service].storage];
	if (storageId) {
		return (await ctx.storage.getUrl(storageId)) ?? undefined;
	}
	return doc[QR_FIELDS[service].url];
}

/**
 * Sets a QR image from an uploaded file or a URL, deleting any replaced
 * upload. Returns the patch for the caller to apply, plus the resolved URL.
 */
export async function buildZineQrImagePatch(
	ctx: MutationCtx,
	doc: ZineQrFields,
	service: ZineQrService,
	args: { qrImageUrl?: string; storageId?: Id<"_storage"> },
): Promise<{ patch: Partial<ZineQrFields>; qrImageUrl?: string }> {
	const { storage: storageField, url: urlField } = QR_FIELDS[service];
	const existingStorageId = doc[storageField];

	if (args.storageId !== undefined) {
		if (existingStorageId && existingStorageId !== args.storageId) {
			await ctx.storage.delete(existingStorageId);
		}
		return {
			patch: { [storageField]: args.storageId, [urlField]: undefined },
			qrImageUrl: (await ctx.storage.getUrl(args.storageId)) ?? undefined,
		};
	}

	if (args.qrImageUrl !== undefined) {
		if (existingStorageId) {
			await ctx.storage.delete(existingStorageId);
		}
		const normalized = args.qrImageUrl.trim() || undefined;
		return {
			patch: { [urlField]: normalized, [storageField]: undefined },
			qrImageUrl: normalized,
		};
	}

	throw new Error("No QR image provided");
}

export function buildZineQrTogglesPatch(args: {
	showSpotifyQr?: boolean;
	showAppleMusicQr?: boolean;
}): Partial<ZineQrFields> {
	const patch: Partial<ZineQrFields> = {};
	if (args.showSpotifyQr !== undefined) {
		patch.zineShowSpotifyQr = args.showSpotifyQr ? true : undefined;
	}
	if (args.showAppleMusicQr !== undefined) {
		patch.zineShowAppleMusicQr = args.showAppleMusicQr ? true : undefined;
	}
	return patch;
}
