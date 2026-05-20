import { NodeType, parse as parseHTML } from "node-html-parser";
import type { HTMLElement } from "node-html-parser";
import { taxonomyKeyFromLabel } from "./rateYourMusicTaxonomy";

export type ParsedRymGenreNode = {
	key: string;
	label: string;
	href?: string;
	description?: string;
	isTopLevel?: boolean;
	children: ParsedRymGenreNode[];
};

export type FlatRymGenre = {
	key: string;
	label: string;
	href?: string;
	description?: string;
	isTopLevel: boolean;
};

export type FlatRymGenreRelationship = {
	parentKey: string;
	childKey: string;
	position: number;
};

export type FlatRymGenreHierarchy = {
	genres: FlatRymGenre[];
	relationships: FlatRymGenreRelationship[];
};

export function parseRymGenreHierarchyHtml(html: string): ParsedRymGenreNode[] {
	const root = parseHTML(html);
	const hierarchyRoot = root.querySelector("ul.page_genre_index_hierarchy");
	if (!hierarchyRoot) {
		return [];
	}

	const topLevelGenres = directChildrenWithClass(
		hierarchyRoot,
		"page_genre_index_hierarchy_item",
		"li",
	)
		.map((item) => parseTopLevelGenre(item, true))
		.filter((node): node is ParsedRymGenreNode => Boolean(node));

	const uncategorizedGenres = root
		.querySelectorAll(".page_genre_index_hierarchy_uncategorized")
		.flatMap((group) =>
			directChildrenWithClass(group, "page_genre_index_hierarchy_item", "li"),
		)
		.map((item) => parseTopLevelGenre(item, false))
		.filter((node): node is ParsedRymGenreNode => Boolean(node));

	return [...topLevelGenres, ...uncategorizedGenres];
}

export function flattenRymGenreHierarchy(
	nodes: ParsedRymGenreNode[],
): FlatRymGenreHierarchy {
	const genresByKey = new Map<string, FlatRymGenre>();
	const relationshipsByKey = new Map<string, FlatRymGenreRelationship>();

	for (const node of nodes) {
		visitNode(node, true, genresByKey, relationshipsByKey);
	}

	const genres = Array.from(genresByKey.values()).sort((a, b) => {
		const labelComparison = a.label.localeCompare(b.label);
		if (labelComparison !== 0) {
			return labelComparison;
		}

		return a.key.localeCompare(b.key);
	});
	const relationships = Array.from(relationshipsByKey.values()).sort((a, b) => {
		const parentComparison = a.parentKey.localeCompare(b.parentKey);
		if (parentComparison !== 0) {
			return parentComparison;
		}

		if (a.position !== b.position) {
			return a.position - b.position;
		}

		return a.childKey.localeCompare(b.childKey);
	});

	return { genres, relationships };
}

export function buildParentKeysByChildKey(
	relationships: Array<{ parentKey: string; childKey: string }>,
): Map<string, string[]> {
	const parentKeysByChild = new Map<string, string[]>();

	for (const relationship of relationships) {
		const parents = parentKeysByChild.get(relationship.childKey) ?? [];
		if (!parents.includes(relationship.parentKey)) {
			parents.push(relationship.parentKey);
		}
		parentKeysByChild.set(relationship.childKey, parents);
	}

	return parentKeysByChild;
}

/** Adds every ancestor key so parent-genre filters match subgenre-tagged albums. */
export function expandGenreKeysWithAncestorKeys(
	directKeys: Iterable<string>,
	parentKeysByChild: Map<string, string[]>,
): string[] {
	const expanded = new Set<string>();
	const pending = [...directKeys];

	while (pending.length > 0) {
		const key = pending.pop();
		if (!key || expanded.has(key)) {
			continue;
		}

		expanded.add(key);
		const parents = parentKeysByChild.get(key) ?? [];
		for (const parentKey of parents) {
			if (!expanded.has(parentKey)) {
				pending.push(parentKey);
			}
		}
	}

	return [...expanded].sort();
}

function normalizeText(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function hasClass(element: HTMLElement, className: string): boolean {
	return (element.getAttribute("class") || "").split(/\s+/).includes(className);
}

function directElementChildren(element: HTMLElement): HTMLElement[] {
	return element.childNodes.filter(
		(child): child is HTMLElement => child.nodeType === NodeType.ELEMENT_NODE,
	);
}

function directChildrenWithClass(
	element: HTMLElement,
	className: string,
	tagName?: string,
): HTMLElement[] {
	return directElementChildren(element).filter((child) => {
		if (tagName && child.tagName?.toLowerCase() !== tagName) {
			return false;
		}

		return hasClass(child, className);
	});
}

function firstDirectChildWithClass(
	element: HTMLElement,
	className: string,
	tagName?: string,
): HTMLElement | undefined {
	return directChildrenWithClass(element, className, tagName)[0];
}

function normalizeRymGenreHref(href: string | undefined): string | undefined {
	if (!href) {
		return undefined;
	}

	let url: URL;
	try {
		url = new URL(href.trim(), "https://rateyourmusic.com");
	} catch {
		return undefined;
	}

	const hostname = url.hostname.toLowerCase();
	if (
		hostname !== "rateyourmusic.com" &&
		hostname !== "www.rateyourmusic.com"
	) {
		return undefined;
	}

	if (!url.pathname.startsWith("/genre/")) {
		return undefined;
	}

	return url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
}

function parseGenreAnchor(
	anchor: HTMLElement,
): Omit<ParsedRymGenreNode, "children" | "description"> | undefined {
	const label = normalizeText(anchor.textContent);
	if (!label) {
		return undefined;
	}

	const href = normalizeRymGenreHref(anchor.getAttribute("href"));

	return {
		key: taxonomyKeyFromLabel(label),
		label,
		...(href ? { href } : {}),
	};
}

function parseHierarchyListItem(
	item: HTMLElement,
): ParsedRymGenreNode | undefined {
	const details = firstDirectChildWithClass(
		item,
		"hierarchy_list_item_details",
	);
	if (!details) {
		return undefined;
	}

	const anchor = directElementChildren(details).find(
		(child) =>
			child.tagName?.toLowerCase() === "a" &&
			(child.getAttribute("href") || "").includes("/genre/"),
	);
	if (!anchor) {
		return undefined;
	}

	const genre = parseGenreAnchor(anchor);
	if (!genre) {
		return undefined;
	}

	const description = directElementChildren(details).find(
		(child) => child.tagName?.toLowerCase() === "p",
	);
	const descriptionText = description
		? normalizeText(description.textContent)
		: undefined;

	return {
		...genre,
		...(descriptionText ? { description: descriptionText } : {}),
		children: parseNestedChildren(item),
	};
}

function parseTopLevelGenre(
	item: HTMLElement,
	isTopLevel: boolean,
): ParsedRymGenreNode | undefined {
	const anchor = item.querySelector(
		".page_genre_index_hierarchy_item_main_inner h2 a[href*='/genre/']",
	);
	if (!anchor) {
		return undefined;
	}

	const genre = parseGenreAnchor(anchor);
	if (!genre) {
		return undefined;
	}

	const expanded = firstDirectChildWithClass(
		item,
		"page_genre_index_hierarchy_item_expanded",
	);
	const expandedDescription = expanded?.querySelector(
		".page_genre_index_hierarchy_item_description_expanded",
	);
	const collapsedDescription = item.querySelector(
		".page_genre_index_hierarchy_item_description",
	);
	const description = expandedDescription || collapsedDescription;
	const descriptionText = description
		? normalizeText(description.textContent)
		: undefined;

	return {
		...genre,
		...(descriptionText ? { description: descriptionText } : {}),
		isTopLevel,
		children: expanded ? parseNestedChildren(expanded) : [],
	};
}

function parseNestedChildren(parent: HTMLElement): ParsedRymGenreNode[] {
	const children: ParsedRymGenreNode[] = [];
	const lists = directChildrenWithClass(parent, "hierarchy_list", "ul");

	for (const list of lists) {
		for (const item of directChildrenWithClass(
			list,
			"hierarchy_list_item",
			"li",
		)) {
			const child = parseHierarchyListItem(item);
			if (child) {
				children.push(child);
			}
		}
	}

	return children;
}

function visitNode(
	node: ParsedRymGenreNode,
	isTopLevel: boolean,
	genresByKey: Map<string, FlatRymGenre>,
	relationshipsByKey: Map<string, FlatRymGenreRelationship>,
): void {
	const effectiveIsTopLevel = node.isTopLevel ?? isTopLevel;
	const existingGenre = genresByKey.get(node.key);
	if (existingGenre) {
		existingGenre.isTopLevel = existingGenre.isTopLevel || effectiveIsTopLevel;
		if (!existingGenre.href && node.href) {
			existingGenre.href = node.href;
		}
		if (!existingGenre.description && node.description) {
			existingGenre.description = node.description;
		}
	} else {
		genresByKey.set(node.key, {
			key: node.key,
			label: node.label,
			...(node.href ? { href: node.href } : {}),
			...(node.description ? { description: node.description } : {}),
			isTopLevel: effectiveIsTopLevel,
		});
	}

	node.children.forEach((child, position) => {
		const relationshipKey = `${node.key}\0${child.key}`;
		if (!relationshipsByKey.has(relationshipKey)) {
			relationshipsByKey.set(relationshipKey, {
				parentKey: node.key,
				childKey: child.key,
				position,
			});
		}

		visitNode(child, false, genresByKey, relationshipsByKey);
	});
}
