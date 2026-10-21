// When a failed title read is tried again. Convex imports this: relative
// imports only.

/** Failed AI reads a Listing gets before it stays failed. */
export const MAX_TITLE_READ_ATTEMPTS = 3;
/** How long a failed read waits before it's due a retry. */
export const TITLE_READ_RETRY_DELAY_MS = 30 * 60 * 1000;
/** Gap between re-queued reads, so a batch never hits TypeSafe all at once. */
export const TITLE_READ_STAGGER_MS = 250;

/**
 * Where a Listing stands after a failed read. A missing TypeSafe key isn't the
 * title's fault, so it isn't counted: the read is retried once the key exists.
 * `retryAt` is null once the attempts are used up.
 */
export function failedTitleRead(
	previousAttempts: number,
	keyMissing: boolean,
	now: number,
): { attempts: number; retryAt: number | null } {
	const attempts = keyMissing ? previousAttempts : previousAttempts + 1;
	return {
		attempts,
		retryAt:
			attempts < MAX_TITLE_READ_ATTEMPTS
				? now + TITLE_READ_RETRY_DELAY_MS
				: null,
	};
}
