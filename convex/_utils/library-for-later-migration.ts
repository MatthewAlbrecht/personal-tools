export function duplicateGroupStartsOnPage(
	legacyRows: Array<{ _id: string }>,
	pageRows: Array<{ _id: string }>,
): boolean {
	const firstLegacyRow = legacyRows[0];
	return (
		firstLegacyRow !== undefined &&
		pageRows.some((row) => row._id === firstLegacyRow._id)
	);
}
