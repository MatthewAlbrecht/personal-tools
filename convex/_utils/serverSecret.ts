// Shared-secret check for server-to-Convex HTTP actions. Pure Web Crypto so it
// runs in the Convex default runtime.

export const MIN_SERVER_SECRET_LENGTH = 16;

const encoder = new TextEncoder();

async function sha256(value: string): Promise<Uint8Array> {
	return new Uint8Array(
		await crypto.subtle.digest("SHA-256", encoder.encode(value)),
	);
}

/**
 * True when `authorizationHeader` is exactly `Bearer <secret>`.
 * Both sides are hashed first so the byte comparison is fixed-length and
 * data-independent. Fails closed when the secret is unset or too short.
 */
export async function bearerMatchesSecret(
	authorizationHeader: string | null,
	secret: string | undefined,
): Promise<boolean> {
	if (!secret || secret.length < MIN_SERVER_SECRET_LENGTH) return false;
	if (!authorizationHeader?.startsWith("Bearer ")) return false;

	const [provided, expected] = await Promise.all([
		sha256(authorizationHeader.slice("Bearer ".length)),
		sha256(secret),
	]);
	let diff = 0;
	for (let i = 0; i < expected.length; i++) {
		diff |= (provided[i] ?? 0) ^ (expected[i] ?? 0);
	}
	return diff === 0;
}
