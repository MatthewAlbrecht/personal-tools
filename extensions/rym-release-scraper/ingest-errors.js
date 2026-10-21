// What to say when the app refuses a Yu-Gi-Oh capture or automation call.
// The dock gets one short, actionable sentence; the console gets the status
// and a short excerpt of the body, never a whole HTML error page. No chrome
// APIs here, so Vitest can load it.

const LOG_EXCERPT_CHARS = 120;

/**
 * `{ message, log }` for a failed response: `message` for the dock and the
 * run's errors, `log` for the console.
 */
function describeFailedResponse(origin, status, bodyText) {
	let host = origin;
	try {
		host = new URL(origin).host;
	} catch {
		// keep the origin as given
	}
	let reason = null;
	try {
		const parsed = JSON.parse(bodyText);
		if (typeof parsed?.error === "string" && parsed.error.trim()) {
			reason = parsed.error.trim();
		}
	} catch {
		// not JSON: an error page
	}

	let message;
	if (status === 404) {
		message = `The app at ${host} doesn't have this capture yet (404). Deploy it, or point the extension at http://localhost:1333 in its options.`;
	} else if (status === 401) {
		message = `The ingest secret doesn't match the app at ${host} (401). Copy the app's RYM_EXTENSION_INGEST_SECRET into the extension's options.`;
	} else if (reason) {
		message = reason;
	} else {
		message = `The app at ${host} answered HTTP ${status}.`;
	}

	const excerpt = reason ?? bodyExcerpt(String(bodyText ?? ""));
	return { message, log: `HTTP ${status}${excerpt ? `: ${excerpt}` : ""}` };
}

/** An HTML page's title, or the body's text without tags, cut short. */
function bodyExcerpt(text) {
	const title = /<title[^>]*>([^<]*)<\/title>/i.exec(text)?.[1];
	const plain = (
		title ?? text.replace(/<script[\s\S]*?<\/script>|<[^>]+>/gi, " ")
	)
		.replace(/\s+/g, " ")
		.trim();
	return plain.length > LOG_EXCERPT_CHARS
		? `${plain.slice(0, LOG_EXCERPT_CHARS)}…`
		: plain;
}

globalThis.describeFailedResponse = describeFailedResponse;
