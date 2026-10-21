import { describe, expect, test } from "vitest";
import {
	MAX_TITLE_READ_ATTEMPTS,
	TITLE_READ_RETRY_DELAY_MS,
	failedTitleRead,
} from "./title-read-retry";

const NOW = Date.UTC(2026, 9, 20, 12, 0);

describe("failedTitleRead", () => {
	test("counts the attempt and schedules a retry", () => {
		expect(failedTitleRead(0, false, NOW)).toEqual({
			attempts: 1,
			retryAt: NOW + TITLE_READ_RETRY_DELAY_MS,
		});
	});

	test("stops retrying once the attempts are used up", () => {
		expect(failedTitleRead(MAX_TITLE_READ_ATTEMPTS - 1, false, NOW)).toEqual({
			attempts: MAX_TITLE_READ_ATTEMPTS,
			retryAt: null,
		});
	});

	test("a missing key isn't counted and is always retried", () => {
		expect(failedTitleRead(1, true, NOW)).toEqual({
			attempts: 1,
			retryAt: NOW + TITLE_READ_RETRY_DELAY_MS,
		});
	});
});
