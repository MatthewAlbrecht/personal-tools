/**
 * Utility functions for generating Folio Society image URLs
 */

/**
 * Generates potential image URLs for a Folio Society release
 * @param sku - The SKU of the release
 * @param existingImagePath - Optional existing image path from the database
 * @returns Array of potential image URLs to try
 */
export function generateImageUrls(
	sku: string,
	existingImagePath?: string | null,
): string[] {
	const urls = [];

	// Add the original image from database first (if it exists)
	if (existingImagePath) {
		urls.push(
			`https://www.foliosociety.com/static/media/catalog${existingImagePath}`,
		);
	}

	// Extract the directory pattern from existing image path if available
	let baseDir = "";
	if (existingImagePath) {
		// Extract directory from path like "/product/k/l/klass_03.jpg"
		const pathParts = existingImagePath.split("/");
		if (pathParts.length >= 4) {
			baseDir = `/${pathParts[1]}/${pathParts[2]}/${pathParts[3]}/`;
		}
	}

	// If no existing image or couldn't extract directory, try both patterns
	if (!baseDir) {
		// Try the /product/first_char/second_char/ pattern
		const firstChar = sku.charAt(0).toLowerCase();
		const secondChar = sku.charAt(1).toLowerCase();
		baseDir = `/product/${firstChar}/${secondChar}/`;
	}

	// Generate variant URLs using the determined base directory
	const skuLower = sku.toLowerCase();
	const variants = [
		"_base",
		"_1_base",
		"_01_base",
		"_hover",
		"_2_hover",
		"_02_hover",
		"_3",
		"03",
		"_4",
		"_04",
		"_5",
		"_05",
		"_6",
		"_06",
		"_7",
		"_07",
		"_8",
		"_08",
		"_9",
		"09",
		"_10",
		"_11",
		"_12",
	];

	for (const variant of variants) {
		const imagePath = `${baseDir}${skuLower}${variant}.jpg`;
		const fullUrl = `https://www.foliosociety.com/static/media/catalog${imagePath}`;

		// Avoid duplicates
		if (!urls.includes(fullUrl)) {
			urls.push(fullUrl);
		}
	}

	return urls;
}
