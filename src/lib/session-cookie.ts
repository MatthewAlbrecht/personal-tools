// Signed session cookie. Pure Web Crypto, relative imports only, so it runs in
// the Edge middleware, Node route handlers, and Vitest alike.
//
// Format: `base64url("<username>:<issuedAtMs>") + "." + base64url(HMAC-SHA256)`.
// The username stays first in the payload so legacy readers that do
// `Buffer.from(cookie, "base64url").toString().split(":")[0]` still get it.

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
	if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
	const padded = value.replace(/-/g, "+").replace(/_/g, "/");
	try {
		const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
		return Uint8Array.from(binary, (char) => char.charCodeAt(0));
	} catch {
		return null;
	}
}

async function hmacKey(secret: string, usage: "sign" | "verify") {
	return crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		[usage],
	);
}

/** Constant-time (for equal-length inputs) string comparison. */
export function constantTimeEqual(a: string, b: string): boolean {
	const left = encoder.encode(a);
	const right = encoder.encode(b);
	let diff = left.length ^ right.length;
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
	}
	return diff === 0;
}

export async function signSessionCookie(
	username: string,
	secret: string,
	now: number = Date.now(),
): Promise<string> {
	const payload = toBase64Url(encoder.encode(`${username}:${now}`));
	const signature = await crypto.subtle.sign(
		"HMAC",
		await hmacKey(secret, "sign"),
		encoder.encode(payload),
	);
	return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionCookie(
	token: string | null | undefined,
	secret: string,
	now: number = Date.now(),
): Promise<{ username: string; issuedAt: number } | null> {
	if (!token) return null;
	const parts = token.split(".");
	if (parts.length !== 2) return null;
	const [payload, signature] = parts as [string, string];

	const signatureBytes = fromBase64Url(signature);
	if (!signatureBytes) return null;
	// crypto.subtle.verify compares the MAC in constant time.
	const valid = await crypto.subtle.verify(
		"HMAC",
		await hmacKey(secret, "verify"),
		signatureBytes,
		encoder.encode(payload),
	);
	if (!valid) return null;

	const payloadBytes = fromBase64Url(payload);
	if (!payloadBytes) return null;
	const decoded = new TextDecoder().decode(payloadBytes);
	const separator = decoded.lastIndexOf(":");
	if (separator <= 0) return null;
	const username = decoded.slice(0, separator);
	const issuedAt = Number(decoded.slice(separator + 1));
	if (!Number.isFinite(issuedAt)) return null;
	if (now - issuedAt > SESSION_MAX_AGE_SECONDS * 1000) return null;

	return { username, issuedAt };
}
