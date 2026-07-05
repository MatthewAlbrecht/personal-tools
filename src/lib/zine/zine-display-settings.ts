export type ZineDisplaySettings = {
	showArtist: boolean;
	showAlbum: boolean;
	showYear: boolean;
	showAlbumArt: boolean;
	showIntro: boolean;
	showGeniusInfo: boolean;
	showSectionLabels: boolean;
	showUserNote: boolean;
};

export const ZINE_DISPLAY_DEFAULTS: ZineDisplaySettings = {
	showArtist: true,
	showAlbum: true,
	showYear: true,
	showAlbumArt: true,
	showIntro: true,
	showGeniusInfo: false,
	showSectionLabels: false,
	showUserNote: true,
};

export function resolveZineDisplaySettings(
	stored?: Partial<ZineDisplaySettings> | null,
): ZineDisplaySettings {
	return {
		...ZINE_DISPLAY_DEFAULTS,
		...stored,
	};
}
