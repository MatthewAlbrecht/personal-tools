import {
	parseIntroContent,
	type IntroContentSpan,
} from "~/lib/zine/zine-intro-content";
import { cn } from "~/lib/utils";

export function FormattedIntroContent({
	content,
	className,
	paragraphClassName,
}: {
	content: string;
	className?: string;
	paragraphClassName?: string;
}) {
	const paragraphs = parseIntroContent(content);
	if (paragraphs.length === 0) {
		return null;
	}

	return (
		<div className={cn("zine-formatted-intro", className)}>
			{paragraphs.map((paragraph, paragraphIndex) => (
				<p
					key={`formatted-intro-paragraph-${paragraphIndex}`}
					className={cn("zine-formatted-intro-paragraph", paragraphClassName)}
				>
					{paragraph.map((span, spanIndex) => {
						const key = `formatted-intro-span-${paragraphIndex}-${spanIndex}`;
						if (span.lineBreakBefore) {
							return (
								<span key={key}>
									<br />
									<FormattedIntroSpan span={span} />
								</span>
							);
						}

						return <FormattedIntroSpan key={key} span={span} />;
					})}
				</p>
			))}
		</div>
	);
}

function FormattedIntroSpan({ span }: { span: IntroContentSpan }) {
	if (span.bold) {
		return <strong>{span.text}</strong>;
	}

	if (span.italic) {
		return <em>{span.text}</em>;
	}

	return <span>{span.text}</span>;
}
