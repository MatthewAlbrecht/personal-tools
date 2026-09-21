import { cn } from "~/lib/utils";
import {
	type ZinePageRecommendation,
	getPageRecommendationLayout,
} from "~/lib/zine/zine-page-recommendations";

export function ZineSongPageRecommendations({
	items,
}: {
	items: ZinePageRecommendation[];
}) {
	if (items.length === 0) {
		return null;
	}

	const layout = getPageRecommendationLayout(items.length);

	return (
		<ul
			className={cn(
				"zine-page-recommendations",
				layout === "pair" && "zine-page-recommendations-pair",
			)}
		>
			{items.map((item, index) => (
				<PageRecommendationItem
					key={`${item.albumTitle}-${item.artistName}-${index}`}
					item={item}
				/>
			))}
		</ul>
	);
}

function PageRecommendationItem({ item }: { item: ZinePageRecommendation }) {
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
			</div>
		</li>
	);
}
