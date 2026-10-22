import { cn } from "~/lib/utils";
import {
	type ZinePageRecommendation,
	getPageRecommendationLayout,
	hasPageRecommendationPitch,
} from "~/lib/zine/zine-page-recommendations";

export function ZineSongPageRecommendations({
	items,
	showLabel = true,
	showPadding = true,
}: {
	items: ZinePageRecommendation[];
	showLabel?: boolean;
	showPadding?: boolean;
}) {
	if (items.length === 0) {
		return null;
	}

	const layout = getPageRecommendationLayout(items.length);
	const compact = !hasPageRecommendationPitch(items);

	return (
		<div
			className={cn(
				"zine-page-recommendations-block",
				showPadding && "zine-page-recommendations-padded",
				showLabel && "zine-page-recommendations-with-label",
			)}
		>
			{showLabel ? (
				<p className="zine-page-recommendations-label">
					Additional Recommendations
				</p>
			) : null}
			<ul
				className={cn(
					"zine-page-recommendations",
					layout === "pair" && "zine-page-recommendations-pair",
					compact && "zine-page-recommendations-compact",
				)}
			>
				{items.map((item, index) => (
					<PageRecommendationItem
						key={`${item.albumTitle}-${item.artistName}-${index}`}
						item={item}
						compact={compact}
					/>
				))}
			</ul>
		</div>
	);
}

function PageRecommendationItem({
	item,
	compact,
}: {
	item: ZinePageRecommendation;
	compact: boolean;
}) {
	return (
		<li className="zine-page-recommendation">
			{item.imageUrl ? (
				<img
					src={item.imageUrl}
					alt=""
					className="zine-page-recommendation-art"
				/>
			) : (
				<div className="zine-page-recommendation-art zine-page-recommendation-art-placeholder" />
			)}
			<div className="zine-page-recommendation-text">
				<p className="zine-page-recommendation-title">{item.albumTitle}</p>
				<p className="zine-page-recommendation-artist">{item.artistName}</p>
				{item.pitch?.trim() ? (
					<p className="zine-page-recommendation-pitch">{item.pitch}</p>
				) : null}
				{compact && item.year ? (
					<p className="zine-page-recommendation-year">{item.year}</p>
				) : null}
			</div>
		</li>
	);
}
