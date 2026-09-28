import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	testMatch: "launch-dnd.spec.mjs",
	fullyParallel: false,
	retries: 0,
	timeout: 20_000,
	expect: {
		timeout: 5_000,
	},
	use: {
		baseURL: "http://127.0.0.1:4173",
		trace: "retain-on-failure",
	},
	webServer: {
		command: "python3 -m http.server 4173 --directory public",
		url: "http://127.0.0.1:4173/launch.html",
		reuseExistingServer: true,
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "webkit",
			use: { ...devices["Desktop Safari"] },
		},
		{
			name: "iphone-webkit",
			use: { ...devices["iPhone 13"] },
		},
	],
});
