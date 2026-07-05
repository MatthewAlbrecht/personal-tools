"use client";

import type { CSSProperties } from "react";
import { cn } from "~/lib/utils";
import type {
	ZineDiscographyItem,
	ZineInsideBackSection,
	ZineRecommendationItem,
} from "~/lib/zine/zine-inside-back-sections";
import {
	ZINE_INSIDE_BACK_DEFAULT_TITLES,
	getVisibleDiscographyItems,
	hasInsideBackContent,
} from "~/lib/zine/zine-inside-back-sections";
import {
	type ZineInsideBackLayoutSettings,
	formatInsideBackAlbumTitle,
	insideBackLayoutToStyleProperties,
} from "~/lib/zine/zine-inside-back-layout";

export function ZineInsideBackPage({
	sections,
	settings,
	canEdit,
}: {
	sections: ZineInsideBackSection[];
	settings: ZineInsideBackLayoutSettings;
	canEdit?: boolean;
}) {
	const totalItems = sections.reduce((count, section) => {
		if (section.type === "discography") {
			return count + getVisibleDiscographyItems(section.items).length;
		}

		return count + section.items.length;
	}, 0);
	const compact = totalItems > 5;

	return (
		<section
			className={cn(
				"zine-page zine-page-preview zine-page-inside-back",
				settings.contentAlign === "center" &&
					"zine-page-inside-back-content-center",
				settings.contentAlign === "right" &&
					"zine-page-inside-back-content-right",
				settings.recommendationRowAlign === "center" &&
					"zine-page-inside-back-recommendation-rows-center",
				compact && "zine-page-inside-back-compact",
			)}
			style={insideBackLayoutToStyleProperties(settings) as CSSProperties}
		>
			<div className="zine-inside-back-outer">
				<div className="zine-inside-back-inner">
					{hasInsideBackContent(sections) ? (
						sections.map((section, index) => (
							<InsideBackSectionBlock
								key={`${section.type}-${index}`}
								section={section}
								artistDisplay={settings.artistDisplay}
							/>
						))
					) : canEdit ? (
						<p className="zine-inside-back-placeholder">
							Inside back cover — add sections on the edit page.
						</p>
					) : null}
				</div>
			</div>
		</section>
	);
}

function InsideBackSectionBlock({
	section,
	artistDisplay,
}: {
	section: ZineInsideBackSection;
	artistDisplay: ZineInsideBackLayoutSettings["artistDisplay"];
}) {
	if (section.type === "discography") {
		const visibleItems = getVisibleDiscographyItems(section.items);

		if (visibleItems.length === 0) {
			return null;
		}

		return (
			<div className="zine-inside-back-section zine-inside-back-discography">
				<h2 className="zine-inside-back-section-title">
					{section.title?.trim() || ZINE_INSIDE_BACK_DEFAULT_TITLES.discography}
				</h2>
				<ul className="zine-inside-back-discography-list">
					{visibleItems.map((item, index) => (
						<DiscographyRow
							key={`${item.spotifyAlbumId ?? item.albumTitle}-${index}`}
							item={item}
						/>
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
						artistDisplay={artistDisplay}
					/>
				))}
			</ul>
		</div>
	);
}

function DiscographyRow({ item }: { item: ZineDiscographyItem }) {
	const { titleLine } = formatInsideBackAlbumTitle({
		albumTitle: item.albumTitle,
		year: item.year,
	});

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
				{item.blurb.trim() !== "" ? (
					<p className="zine-inside-back-item-blurb">{item.blurb}</p>
				) : null}
			</div>
		</li>
	);
}

function RecommendationRow({
	item,
	artistDisplay,
}: {
	item: ZineRecommendationItem;
	artistDisplay: ZineInsideBackLayoutSettings["artistDisplay"];
}) {
	const { titleLine, artistLine } = formatInsideBackAlbumTitle({
		albumTitle: item.albumTitle,
		year: item.year,
		artistName: item.artistName,
	});

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
				<p className="zine-inside-back-item-title">
					{titleLine}
					{artistDisplay === "inline" && artistLine ? (
						<>
							{" — "}
							<span className="zine-inside-back-item-artist">
								{artistLine}
							</span>
						</>
					) : null}
				</p>
				{artistDisplay === "newline" && artistLine ? (
					<p className="zine-inside-back-item-artist">{artistLine}</p>
				) : null}
				{item.similarityBlurb ? (
					<p className="zine-inside-back-item-similarity">
						{item.similarityBlurb}
					</p>
				) : null}
			</div>
		</li>
	);
}
