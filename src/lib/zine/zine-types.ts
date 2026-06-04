export type ZineSongDisplayInput = {
	id: string;
	position: number;
	title: string;
	artistName: string;
	albumTitle?: string;
	albumYear?: string;
	albumArtUrl?: string;
	durationSeconds?: number;
	userNote?: string;
	introContent?: string;
	about?: string;
	lyrics: string;
};

export type ZineItemSettings = {
	columnCount?: 1 | 2;
	fontSizePt?: number;
	condenseScale?: number;
	/** Default true when unset. */
	showCredits?: boolean;
};

export type ZineBackCoverQrSlot = {
	imageUrl?: string;
	show: boolean;
};

export type ZineBackCoverQrCodes = {
	spotify?: ZineBackCoverQrSlot;
	appleMusic?: ZineBackCoverQrSlot;
};
