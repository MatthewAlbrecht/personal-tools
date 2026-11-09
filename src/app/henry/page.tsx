import type * as React from "react";
import { Suspense } from "react";
import { LedgerPage, LedgerPageSkeleton } from "./_components/ledger-page";

export default function HenryPage(): React.ReactElement {
	return (
		// LedgerPage reads `?unit=` with useSearchParams, which needs a Suspense boundary.
		<Suspense fallback={<LedgerPageSkeleton />}>
			<LedgerPage />
		</Suspense>
	);
}
