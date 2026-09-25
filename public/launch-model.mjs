export function displayName(bookmark, membership) {
	return membership.name || bookmark.title;
}

export function addProject(bookmark, projectId) {
	if (bookmark.projects.some((item) => item.projectId === projectId)) {
		return bookmark;
	}
	return {
		...bookmark,
		projects: [...bookmark.projects, { projectId }],
	};
}

export function toggleProject(bookmark, projectId) {
	const existing = bookmark.projects.some((item) => item.projectId === projectId);
	if (!existing) return addProject(bookmark, projectId);
	return {
		...bookmark,
		projects: bookmark.projects.filter((item) => item.projectId !== projectId),
	};
}

export function renamePad(bookmark, nextTitle) {
	return { ...bookmark, title: nextTitle };
}

export function renameInProject(bookmark, projectId, nextName) {
	return {
		...bookmark,
		projects: bookmark.projects.map((item) => {
			if (item.projectId !== projectId) return item;
			if (nextName === bookmark.title) return { projectId };
			return { projectId, name: nextName };
		}),
	};
}

export function projectsNewestFirst(projects) {
	return [...projects].sort((a, b) => b.createdAt - a.createdAt);
}
