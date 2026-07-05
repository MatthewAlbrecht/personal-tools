"use client";

import type {
	ZineDiscographyItem,
	ZineInsideBackSection,
	ZineRecommendationItem,
} from "~/lib/zine/zine-inside-back-sections";
import {
	ZINE_INSIDE_BACK_DEFAULT_TITLES,
	hasInsideBackContent,
} from "~/lib/zine/zine-inside-back-sections";
import { cn } from "~/lib/utils";

export function ZineInsideBackPage({
	sections,
	canEdit,
}: {
	sections: ZineInsideBackSection[];
	canEdit?: boolean;
}) {
	const totalItems = sections.reduce(
		(count, section) => count + section.items.length,
		0,
	);
	const compact = totalItems > 5;

	return (
		<section
			className={cn(
				"zine-page zine-page-preview zine-page-inside-back",
				compact && "zine-page-inside-back-compact",
			)}
		>
			<div className="zine-inside-back-inner">
				{hasInsideBackContent(sections) ? (
					sections.map((section, index) => (
						<InsideBackSectionBlock
							key={`${section.type}-${index}`}
							section={section}
						/>
					))
				) : canEdit ? (
					<p className="zine-inside-back-placeholder">
						Inside back cover — add sections on the edit page.
					</p>
				) : null}
			</div>
		</section>
	);
}

function InsideBackSectionBlock({
	section,
}: {
	section: ZineInsideBackSection;
}) {
	if (section.type === "discography") {
		return (
			<div className="zine-inside-back-section zine-inside-back-discography">
				<h2 className="zine-inside-back-section-title">
					{section.title?.trim() ||
						ZINE_INSIDE_BACK_DEFAULT_TITLES.discography}
				</h2>
				<ul className="zine-inside-back-discography-list">
					{section.items.map((item, index) => (
						<DiscographyRow key={`${item.albumTitle}-${index}`} item={item} />
					))}
				</ul>
			</div>
		);
	}

	return (
		<div className="zine-inside-back-section zine-inside-back-recommendations">
			<h2 className="zine-inside-back-section-title">
				{section.title?.trim() ||
					ZINE_INSIDE_BACK_DEFAULT_TITLES.recommendations}
			</h2>
			<ul className="zine-inside-back-recommendations-list">
				{section.items.map((item, index) => (
					<RecommendationRow
						key={`${item.albumTitle}-${index}`}
						item={item}
					/>
				))}
			</ul>
		</div>
	);
}

function DiscographyRow({ item }: { item: ZineDiscographyItem }) {
	const titleLine = [item.albumTitle, item.year ? `(${item.year})` : ""]
		.filter(Boolean)
		.join(" ");

	return (
		<li className="zine-inside-back-discography-row">
			{item.imageUrl ? (
				<img
					src={item.imageUrl}
					alt=""
					className="zine-inside-back-discography-art"
				/>
			) : (
				<div className="zine-inside-back-discography-art zine-inside-back-art-placeholder" />
			)}
			<div className="zine-inside-back-discography-text">
				<p className="zine-inside-back-item-title">{titleLine}</p>
				{item.artistName ? (
					<p className="zine-inside-back-item-artist">{item.artistName}</p>
				) : null}
				<p className="zine-inside-back-item-blurb">{item.blurb}</p>
			</div>
		</li>
	);
}

function RecommendationRow({ item }: { item: ZineRecommendationItem }) {
	return (
		<li className="zine-inside-back-recommendation-row">
			{item.imageUrl ? (
				<img
					src={item.imageUrl}
					alt=""
					className="zine-inside-back-recommendation-art"
				/>
			) : (
				<div className="zine-inside-back-recommendation-art zine-inside-back-art-placeholder" />
			)}
			<div className="zine-inside-back-recommendation-text">
				<p className="zine-inside-back-item-title">{item.albumTitle}</p>
				<p className="zine-inside-back-item-artist">{item.artistName}</p>
				{item.similarityBlurb ? (
					<p className="zine-inside-back-item-similarity">
						{item.similarityBlurb}
					</p>
				) : null}
			</div>
		</li>
	);
}
