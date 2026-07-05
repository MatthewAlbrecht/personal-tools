import type { ZineCredit } from "~/lib/zine/zine-types";

export function ZineSongPageFooterCredits({
	credits,
	canEditCredits,
	onHideCreditLabel,
}: {
	credits: ZineCredit[];
	canEditCredits: boolean;
	onHideCreditLabel?: (label: string) => void;
}) {
	return (
		<div className="zine-footer-credits">
			{credits.map((credit) => (
				<span key={credit.label} className="zine-footer-credit-item">
					{canEditCredits && onHideCreditLabel ? (
						<>
							<button
								type="button"
								className="zine-footer-credit-button no-print"
								onClick={() => onHideCreditLabel(credit.label)}
								title={`Hide ${credit.label}`}
							>
								<ZineFooterCreditContent credit={credit} />
							</button>
							<span className="zine-footer-credit-text print-only">
								<ZineFooterCreditContent credit={credit} />
							</span>
						</>
					) : (
						<span className="zine-footer-credit-text">
							<ZineFooterCreditContent credit={credit} />
						</span>
					)}
				</span>
			))}
		</div>
	);
}

function ZineFooterCreditContent({ credit }: { credit: ZineCredit }) {
	return (
		<>
			<span className="zine-footer-credit-label">{credit.label}</span>{" "}
			<span className="zine-footer-credit-value">
				{formatContributorNames(credit.contributors)}
			</span>
		</>
	);
}

function formatContributorNames(
	contributors: ZineCredit["contributors"],
): string {
	return contributors.map((contributor) => contributor.name).join(", ");
}
