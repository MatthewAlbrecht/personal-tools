const ORIGIN_KEY = "rymBackendOrigin";
const SECRET_KEY = "rymBackendSecret";

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
		originEl.value =
			cfg[ORIGIN_KEY] || "https://www.moooose.dev";
	}
	if (secretEl) {
		secretEl.value = cfg[SECRET_KEY] || "";
	}
}

async function saveOptions() {
	const originEl = document.getElementById("origin");
	const secretEl = document.getElementById("secret");
	const rawOrigin =
		originEl?.value?.trim() || "https://www.moooose.dev";
	const secret = secretEl?.value ?? "";
	await chrome.storage.sync.set({
		[ORIGIN_KEY]: rawOrigin.replace(/\/+$/, ""),
		[SECRET_KEY]: secret,
	});
	setStatus("Saved.");
}

document.addEventListener("DOMContentLoaded", function onReady() {
	void loadOptions();
	const btn = document.getElementById("save");
	if (btn) {
		btn.addEventListener("click", function onSaveClick() {
			void saveOptions();
		});
	}
});
