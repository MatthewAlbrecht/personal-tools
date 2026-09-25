import assert from "node:assert/strict";
import test from "node:test";
import {
	addProject,
	displayName,
	projectsNewestFirst,
	renameInProject,
	renamePad,
	toggleProject,
} from "./launch-model.mjs";

const bookmark = {
	title: "Local",
	projects: [],
};

test("displayName uses the pad title when the membership has no override", () => {
	assert.equal(displayName(bookmark, { projectId: "p1" }), "Local");
});

test("displayName uses the override when present", () => {
	assert.equal(
		displayName(bookmark, { projectId: "p1", name: "Dev" }),
		"Dev",
	);
});

test("addProject appends a membership without a name", () => {
	assert.deepEqual(addProject(bookmark, "p1"), {
		title: "Local",
		projects: [{ projectId: "p1" }],
	});
});

test("addProject leaves an existing membership alone", () => {
	const member = addProject(bookmark, "p1");
	assert.deepEqual(addProject(member, "p1"), member);
});

test("toggleProject adds then removes", () => {
	const added = toggleProject(bookmark, "p1");
	assert.equal(added.projects.length, 1);
	assert.deepEqual(toggleProject(added, "p1").projects, []);
});

test("renamePad updates the title and leaves overrides in place", () => {
	const member = {
		title: "Local",
		projects: [{ projectId: "p1" }, { projectId: "p2", name: "Prod app" }],
	};
	assert.deepEqual(renamePad(member, "Moose local"), {
		title: "Moose local",
		projects: [{ projectId: "p1" }, { projectId: "p2", name: "Prod app" }],
	});
});

test("renameInProject stores an override", () => {
	const member = addProject(bookmark, "p1");
	assert.deepEqual(renameInProject(member, "p1", "Dev"), {
		title: "Local",
		projects: [{ projectId: "p1", name: "Dev" }],
	});
});

test("renameInProject clears the override when the name matches the pad title", () => {
	const named = {
		title: "Local",
		projects: [{ projectId: "p1", name: "Dev" }],
	};
	assert.deepEqual(renameInProject(named, "p1", "Local"), {
		title: "Local",
		projects: [{ projectId: "p1" }],
	});
});

test("projectsNewestFirst puts the latest createdAt first", () => {
	const projects = [
		{ _id: "old", createdAt: 1 },
		{ _id: "new", createdAt: 3 },
		{ _id: "mid", createdAt: 2 },
	];
	assert.deepEqual(
		projectsNewestFirst(projects).map((project) => project._id),
		["new", "mid", "old"],
	);
});
