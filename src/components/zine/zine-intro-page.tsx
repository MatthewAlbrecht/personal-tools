import type { CSSProperties } from "react";
import type { ZineIntroSettings } from "~/lib/zine/zine-intro-layout";
import { cn } from "~/lib/utils";
import { FormattedIntroContent } from "./formatted-intro-content";

export function ZineIntroPage({
	content,
	settings,
}: {
	content: string;
	settings: ZineIntroSettings;
}) {
	const hasContent = content.trim() !== "";

	return (
		<section
			className={cn(
				"zine-page zine-page-preview zine-page-intro",
				settings.verticalAlign === "center" && "zine-page-intro-centered",
			)}
			style={
				{
					"--zine-intro-font-size-pt": settings.fontSizePt,
					"--zine-intro-paragraph-spacing-pt":
						settings.paragraphSpacingPt,
					"--zine-intro-margin-pt": settings.marginPt,
				} as CSSProperties
			}
		>
			<div className="zine-intro-page-inner">
				{hasContent ? (
					<FormattedIntroContent
						content={content}
						paragraphClassName="zine-intro-paragraph"
					/>
				) : null}
			</div>
		</section>
	);
}
