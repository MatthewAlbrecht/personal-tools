"use client";

import { Suspense } from "react";
import { FolioCatalogPage } from "./_components/folio-catalog-page";
import { FolioSeasonSectionSkeleton } from "./_components/folio-season-section";

export default function FolioSocietyPage() {
	return (
		<Suspense
			fallback={
				<div className="w-full p-6 pt-4">
					<FolioSeasonSectionSkeleton />
				</div>
			}
		>
			<FolioCatalogPage />
		</Suspense>
	);
}
