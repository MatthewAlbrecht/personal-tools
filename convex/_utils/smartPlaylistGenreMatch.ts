import type { GenreClause } from "./smartPlaylistFilterModel";

function roleKeySet(
	role: GenreClause["role"],
	primaryKeys: Set<string>,
	secondaryKeys: Set<string>,
): Set<string> {
	if (role === "primary") return primaryKeys;
	if (role === "secondary") return secondaryKeys;
	const either = new Set(primaryKeys);
	for (const key of secondaryKeys) either.add(key);
	return either;
}

export function clauseMatchesRoleKeys(
	clause: GenreClause,
	primaryKeys: Set<string>,
	secondaryKeys: Set<string>,
): boolean {
	return roleKeySet(clause.role, primaryKeys, secondaryKeys).has(
		clause.genreKey,
	);
}

export function albumMatchesGenreClauses(
	primaryKeys: Set<string>,
	secondaryKeys: Set<string>,
	clauses: GenreClause[],
	genreMatch: "all" | "any",
): boolean {
	if (clauses.length === 0) return true;

	const includes = clauses.filter((c) => c.mode === "include");
	const excludes = clauses.filter((c) => c.mode === "exclude");

	for (const clause of excludes) {
		if (clauseMatchesRoleKeys(clause, primaryKeys, secondaryKeys)) {
			return false;
		}
	}

	if (includes.length === 0) return true;

	if (genreMatch === "any") {
		return includes.some((clause) =>
			clauseMatchesRoleKeys(clause, primaryKeys, secondaryKeys),
		);
	}
	return includes.every((clause) =>
		clauseMatchesRoleKeys(clause, primaryKeys, secondaryKeys),
	);
}
