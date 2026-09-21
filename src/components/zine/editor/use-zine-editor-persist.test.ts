import assert from "node:assert/strict";
import test from "node:test";
import { resolveZineEditorPersistNext } from "./use-zine-editor-persist";

/**
 * Editors pass setValue updaters that read event.currentTarget.value.
 * That only works if the updater runs synchronously during the onChange
 * handler — before React nulls the event. Nested setState updaters defer
 * and throw: Cannot read properties of null (reading 'value').
 */
test("resolveZineEditorPersistNext applies functional updates synchronously", () => {
	const event: { currentTarget: { value: string } | null } = {
		currentTarget: { value: "New Playlist" },
	};

	const resolved = resolveZineEditorPersistNext({ title: "" }, (current) => ({
		...current,
		title: event.currentTarget!.value,
	}));

	// Event is cleared after the handler, as React does.
	event.currentTarget = null;

	assert.equal(resolved.title, "New Playlist");
});

test("resolveZineEditorPersistNext returns plain values unchanged", () => {
	const next = { title: "Direct" };
	assert.equal(resolveZineEditorPersistNext({ title: "" }, next), next);
});
