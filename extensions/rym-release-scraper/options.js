const ORIGIN_KEY = "rymBackendOrigin";
const SECRET_KEY = "rymBackendSecret";
// Per profile (storage.local), so it never syncs to my everyday profile.
const AUTOMATION_KEY = "yugiohAutomationEnabled";

function setStatus(text) {
	const el = document.getElementById("status");
	if (el) {
		el.textContent = text;
	}
}

async function loadOptions() {
	const cfg = await chrome.storage.sync.get([ORIGIN_KEY, SECRET_KEY]);
	const originEl = document.getElementById("origin");
	const secretEl = document.getElementById("secret");
	if (originEl) {
		originEl.value = cfg[ORIGIN_KEY] || "https://www.moooose.dev";
	}
	if (secretEl) {
		secretEl.value = cfg[SECRET_KEY] || "";
	}
}

async function saveOptions() {
	const originEl = document.getElementById("origin");
	const secretEl = document.getElementById("secret");
	const rawOrigin = originEl?.value?.trim() || "https://www.moooose.dev";
	const secret = secretEl?.value ?? "";
	await chrome.storage.sync.set({
		[ORIGIN_KEY]: rawOrigin.replace(/\/+$/, ""),
		[SECRET_KEY]: secret,
	});
	setStatus("Saved.");
}

async function loadAutomation() {
	const local = await chrome.storage.local.get(AUTOMATION_KEY);
	const box = document.getElementById("automation");
	if (box) {
		box.checked = local[AUTOMATION_KEY] === true;
	}
}

async function saveAutomation(enabled) {
	await chrome.storage.local.set({ [AUTOMATION_KEY]: enabled });
	const el = document.getElementById("automation-status");
	if (el) {
		el.textContent = enabled
			? "On. This profile runs automated captures."
			: "Off.";
	}
}

document.addEventListener("DOMContentLoaded", function onReady() {
	void loadOptions();
	void loadAutomation();
	const automation = document.getElementById("automation");
	if (automation) {
		automation.addEventListener("change", function onAutomationChange() {
			void saveAutomation(automation.checked);
		});
	}
	const btn = document.getElementById("save");
	if (btn) {
		btn.addEventListener("click", function onSaveClick() {
			void saveOptions();
		});
	}
});
