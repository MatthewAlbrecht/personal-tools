import { describe, expect, test } from "vitest";
import manifest from "~/app/manifest";

// The installable app, as the browser reads /manifest.webmanifest. Lives here
// beside the service-worker test because Vitest only collects listed suites.

describe("the installed app", () => {
	test("opens the site's home page, named for the whole site", () => {
		const app = manifest();
		expect(app.start_url).toBe("/");
		expect(app.name).toBe("moooose");
		expect(app.short_name).toBe("moooose");
	});

	test("keeps its id, so existing Android and desktop installs carry over", () => {
		expect(manifest().id).toBe("/yugioh");
	});
});
