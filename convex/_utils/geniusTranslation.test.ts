import { describe, expect, it } from "vitest";
import { extractEnglishTranslationUrl } from "./geniusParser";

// Trimmed from https://genius.com/Hesse-kassel-pornomiseria-lyrics
const songWithTranslationsHtml = `
<div class="LyricsHeader__Container">
	<ul role="listbox" aria-label="Options" class="DropdownList__ItemsContainer-sc-e88d0b68-0 gLGMfw">
		<li class="DropdownList__Item-sc-e88d0b68-1 gnpjjr"><a class="TranslationLink__Anchor-sc-9cae8d25-0 kvZCvd" href="https://genius.com/Genius-traductions-francaises-hesse-kassel-pornomiseria-traduction-francaise-lyrics" title="Hesse Kassel - Pornomiseria (Traduction Française)" dir="auto">Français</a></li>
		<li class="DropdownList__Item-sc-e88d0b68-1 gnpjjr"><a class="TranslationLink__Anchor-sc-9cae8d25-0 kvZCvd" href="https://genius.com/Genius-english-translations-hesse-kassel-pornomiseria-english-translation-lyrics" title="Hesse Kassel - Pornomiseria (English Translation)" dir="auto">English</a></li>
	</ul>
</div>
`;

const songWithoutTranslationsHtml = `
<div class="LyricsHeader__Container">
	<a href="https://genius.com/Genius-english-translations-other-song-lyrics">Unrelated link</a>
</div>
`;

describe("extractEnglishTranslationUrl", () => {
	it("returns the English translation link from the song header", () => {
		expect(extractEnglishTranslationUrl(songWithTranslationsHtml)).toBe(
			"https://genius.com/Genius-english-translations-hesse-kassel-pornomiseria-english-translation-lyrics",
		);
	});

	it("returns null when the song has no English translation", () => {
		expect(extractEnglishTranslationUrl(songWithoutTranslationsHtml)).toBe(
			null,
		);
	});
});
