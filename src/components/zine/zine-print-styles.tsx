import { ZINE_BOOKLET_PANEL_PADDING_IN } from "~/lib/zine/zine-layout";

const ZINE_BOOKLET_PANEL_PADDING_CSS = `${ZINE_BOOKLET_PANEL_PADDING_IN}in`;

export function ZinePrintStyles() {
	return (
		<style
			// biome-ignore lint/security/noDangerouslySetInnerHtml: static print CSS strings only
			dangerouslySetInnerHTML={{
				__html: `
					/*
					 Duplex: Letter‑landscape booklet usually prints two‑sided with flip on the short edge.
					 Select long edge in the UI (data-zine-duplex-binding="long-edge") to pre‑rotate back
					 spreads ~180°. Save-as-PDF can use data-zine-export-mode="pdf" for the same rotation.
					*/
					/* Letter landscape: two 5.5in half-letter panels; uniform inner inset via ZINE_BOOKLET_PANEL_PADDING_IN. */
					@page {
						size: 11in 8.5in;
						margin: 0;
					}

					.zine-page {
						width: 5.5in;
						height: 8.5in;
						max-height: 8.5in;
						padding: 0.35in;
						box-sizing: border-box;
						overflow: hidden;
						background: #fff;
						color: #000;
						/* Preserve intentional greys/accents in print preview (Chromium economy mode). */
						-webkit-print-color-adjust: exact;
						print-color-adjust: exact;
					}

					/* Full-bleed cover spread: one image across front + back on outer sheet. */
					.zine-cover-front,
					.zine-cover-back {
						position: relative;
						overflow: hidden;
					}

					.zine-page-cover {
						display: flex;
						align-items: center;
						justify-content: center;
					}

					.zine-cover-has-image.zine-cover-spread-half {
						padding: 0 !important;
						background-repeat: no-repeat;
						background-size: 200% 100%;
						-webkit-print-color-adjust: exact;
						print-color-adjust: exact;
					}

					.zine-cover-front.zine-cover-has-image {
						background-position: 100% center;
					}

					.zine-cover-back.zine-cover-has-image {
						background-position: 0% center;
					}

					.zine-cover-title-wrap {
						position: relative;
						z-index: 1;
						box-sizing: border-box;
						display: flex;
						align-items: center;
						justify-content: center;
						width: 100%;
						height: 100%;
						padding: 0.35in;
					}

					.zine-cover-title-pill {
						display: inline-block;
						max-width: 100%;
						padding: 0.08in 0.12in;
						background: #fff;
						color: #000;
						-webkit-print-color-adjust: exact;
						print-color-adjust: exact;
					}

					.zine-back-cover-qrs {
						position: absolute;
						right: 0.35in;
						bottom: 0.35in;
						left: 0.35in;
						z-index: 1;
						display: flex;
						flex-direction: row;
						align-items: flex-end;
						justify-content: space-between;
						-webkit-print-color-adjust: exact;
						print-color-adjust: exact;
					}

					.zine-back-cover-qr-item {
						display: flex;
						flex-direction: column;
						align-items: center;
						gap: 0.05in;
						padding: 0.05in 0.06in 0.06in;
						background: #fff;
						border-radius: 0.08in;
						-webkit-print-color-adjust: exact;
						print-color-adjust: exact;
					}

					.zine-back-cover-qr-item--solo-right {
						margin-left: auto;
					}

					.zine-back-cover-qr-logo {
						box-sizing: content-box;
						width: 0.28in;
						height: 0.28in;
						flex-shrink: 0;
						padding: 0.04in;
						background: #fff;
						border-radius: 0.05in;
						-webkit-print-color-adjust: exact;
						print-color-adjust: exact;
					}

					.zine-back-cover-qr-image {
						display: block;
						box-sizing: border-box;
						width: 0.85in;
						height: 0.85in;
						object-fit: contain;
						background: #fff;
						padding: 0.04in;
						border-radius: 0.06in;
						-webkit-print-color-adjust: exact;
						print-color-adjust: exact;
					}

					.zine-booklet-sheet.zine-booklet-cover-spread {
						background-repeat: no-repeat;
						background-size: cover;
						background-position: center center;
						-webkit-print-color-adjust: exact;
						print-color-adjust: exact;
					}

					.zine-booklet-cover-spread .zine-booklet-panel {
						padding: 0;
						background: transparent;
					}

					.zine-booklet-cover-spread .zine-page-cover {
						padding: 0 !important;
						background: transparent !important;
					}

					.zine-cover-greyscale.zine-booklet-cover-spread,
					.zine-cover-greyscale.zine-cover-has-image {
						filter: grayscale(100%);
						-webkit-print-color-adjust: exact;
						print-color-adjust: exact;
					}

					.zine-page-song {
						display: flex;
						flex-direction: column;
						min-height: 0;
					}

					.zine-song-page-header-wrap {
						flex-shrink: 0;
					}

					.zine-song-lyrics-body {
						flex: 1 1 0;
						min-height: 0;
					}

					.zine-document {
						display: flex;
						flex-direction: column;
						align-items: flex-start;
					}

					.zine-booklet-sheet {
						box-sizing: border-box;
						width: 11in;
						height: 8.5in;
						display: flex;
						flex-direction: row;
						flex-wrap: nowrap;
						align-items: stretch;
						background: #fff;
					}

					.zine-booklet-panel {
						box-sizing: border-box;
						flex: 0 0 5.5in;
						width: 5.5in;
						max-width: 5.5in;
						height: 8.5in;
						max-height: 8.5in;
						padding: ${ZINE_BOOKLET_PANEL_PADDING_CSS};
						overflow: hidden;
					}

					.zine-booklet-panel .zine-page {
						box-sizing: border-box;
						width: 100% !important;
						max-width: 100% !important;
						height: 100% !important;
						max-height: 100% !important;
					}

					@media screen {
						.zine-print-booklet-root {
							position: absolute;
							left: -10000px;
							top: 0;
							width: 11in;
							pointer-events: none;
							opacity: 0;
							z-index: -1;
							overflow: hidden;
						}

						.zine-print-booklet-root .zine-booklet-sheet + .zine-booklet-sheet {
							margin-top: 0;
						}

						.zine-print-booklet-root .zine-page.zine-page-preview {
							border: 0 !important;
							box-shadow: none !important;
							margin: 0 !important;
						}

						/* Site header uses h-14 (3.5rem); sticky panel must sit fully below it. */
						.zine-screen-document.zine-document {
							padding: 2rem 0 3rem;
						}

						.zine-song-columns-panel {
							position: sticky;
							top: 4rem;
						}

						/* Keep half-letter aspect in flex row with controls; do not affect print. */
						.zine-page.zine-page-preview {
							flex-shrink: 0;
							max-width: 5.5in;
							aspect-ratio: 5.5 / 8.5;
							margin: 0 0 1.5rem;
							border: 1px solid #d4d4d4;
							box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
						}
					}

					/* Screen: [zine page preview] then [column controls]; print: shell is block, aside is .no-print. */
					.zine-song-preview-shell {
						display: flex;
						flex-wrap: wrap;
						flex-direction: row;
						align-items: flex-start;
						justify-content: flex-start;
						column-gap: 1rem;
						row-gap: 0.75rem;
					}

					.zine-song-columns-panel {
						width: 180px;
						flex-shrink: 0;
					}

					.zine-lyrics-single-column {
						column-count: 1;
						overflow: hidden;
					}

					.zine-lyrics-columns {
						column-count: 2;
						column-gap: 0.15in;
						column-fill: auto;
						overflow: hidden;
					}

					.zine-album-art {
						display: block;
						width: 1.7in;
						height: 1.7in;
						flex-shrink: 0;
						object-fit: cover;
					}

					.zine-song-top {
						display: flex;
						align-items: flex-start;
						gap: 0.25in;
						margin-bottom: 0.25in;
					}

					.zine-song-top-info {
						min-width: 0;
						flex: 1;
					}

					.zine-song-intro {
						margin-top: 0.13in;
					}

					.zine-section-label {
						margin: 0;
						font-size: 6pt;
						font-weight: 600;
						line-height: 1;
						text-transform: uppercase;
						color: #666;
					}

					.zine-song-intro-label {
						margin: 0 0 0.04in;
					}

					.zine-song-lyrics-label {
						margin: 0.08in 0 0.04in;
					}

					.zine-song-footer-credits-label {
						margin: 0.08in 0 0.04in;
						flex-shrink: 0;
					}

					/* Matches ZINE_FOOTER_ZONE_IN (= ZINE_FOOTER_ZONE_HEIGHT_PT / 72) in zine-layout.ts. */
					.zine-song-page-footer {
						box-sizing: border-box;
						display: flex;
						flex-direction: column;
						flex-shrink: 0;
						height: 0.85in;
						min-height: 0.85in;
						max-height: 0.85in;
						margin-top: auto;
						justify-content: flex-start;
					}

					.zine-song-footer-rule {
						border: 0;
						border-top: 1px solid #666666;
						margin: 0;
						width: 100%;
						height: 0;
						flex-shrink: 0;
					}

					.zine-song-footer {
						flex: 1 1 auto;
						min-height: 0;
						overflow: hidden;
					}

					.zine-song-intro-body {
						margin: 0;
						font-size: 7pt;
						line-height: 1.35;
					}

					.zine-song-primary-line-clip {
						min-width: 0;
						width: 100%;
						box-sizing: border-box;
					}

					.zine-song-lyrics-scaled-inner {
						min-height: 0;
						box-sizing: border-box;
					}

					.zine-song-primary-line {
						display: flex;
						flex-wrap: nowrap;
						align-items: baseline;
						width: 100%;
						min-width: 0;
						gap: 0.35em;
						line-height: 1;
					}

					.zine-song-track-number,
					.zine-song-track-duration {
						flex-shrink: 0;
						font-weight: 400;
						font-size: 0.72em;
						color: #888;
					}

					.zine-song-credits {
						color: #888;
					}

					.zine-song-track-title {
						min-width: 0;
						flex: 0 1 auto;
						font-weight: 600;
						font-size: 13pt;
					}

					@media print {
						/* Screen-only max-width/padding; must not inset imposed sheets. */
						.zine-layout-shell {
							max-width: none !important;
							margin-left: 0 !important;
							margin-right: 0 !important;
							padding: 0 !important;
						}

						html,
						body {
							width: 11in;
							height: auto;
							margin: 0 !important;
							padding: 0 !important;
							background: #fff !important;
						}

						.no-print {
							display: none !important;
						}

						header.sticky {
							display: none !important;
						}

						.zine-screen-document {
							display: none !important;
						}

						.zine-print-booklet-root {
							position: static !important;
							left: auto !important;
							top: auto !important;
							width: auto !important;
							opacity: 1 !important;
							z-index: auto !important;
							overflow: visible !important;
							pointer-events: auto !important;
						}

						.zine-document {
							display: block;
							align-items: unset;
							padding: 0;
							margin: 0;
						}

						.zine-song-preview-shell {
							display: block;
							column-gap: unset;
							row-gap: unset;
						}

						.zine-booklet-sheet {
							page-break-after: always;
							break-after: page;
							page-break-inside: avoid;
							break-inside: avoid;
							-webkit-print-color-adjust: exact;
							print-color-adjust: exact;
						}

						.zine-print-booklet-root[data-zine-duplex-binding="long-edge"]
							.zine-booklet-sheet[data-booklet-sheet-side="back"],
						.zine-print-booklet-root[data-zine-export-mode="pdf"]
							.zine-booklet-sheet[data-booklet-sheet-side="back"] {
							transform: rotate(180deg);
							transform-origin: center center;
						}

						.zine-booklet-sheet:last-of-type {
							page-break-after: auto;
							break-after: auto;
						}

						.zine-booklet-panel .zine-page {
							margin: 0 !important;
							padding: 0 !important;
							border: none !important;
							box-shadow: none !important;
							page-break-after: auto !important;
							break-after: auto !important;
							page-break-inside: avoid;
							break-inside: avoid;
							-webkit-print-color-adjust: exact;
							print-color-adjust: exact;
						}

						.zine-cover-title-pill {
							background: #fff !important;
							-webkit-print-color-adjust: exact !important;
							print-color-adjust: exact !important;
						}

						.zine-back-cover-qr-item,
						.zine-back-cover-qr-logo,
						.zine-back-cover-qr-image {
							background: #fff !important;
							-webkit-print-color-adjust: exact !important;
							print-color-adjust: exact !important;
						}

						.zine-song-lyrics,
						.zine-song-header,
						.zine-song-title {
							break-inside: avoid;
							page-break-inside: avoid;
						}
					}
				`,
			}}
		/>
	);
}
