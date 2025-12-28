"use client";

import { Disc3, Loader2 } from "lucide-react";
import Image from "next/image";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "~/components/ui/drawer";

type TrackInfo = {
	trackName: string;
	artistName: string;
	albumName?: string;
	albumImageUrl?: string;
	spotifyAlbumId?: string;
	lastPlayedAt?: number;
	releaseDate?: string;
};

type AddListenDrawerProps = {
	track: TrackInfo | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: (listenedAt: number) => Promise<void>;
	isSaving: boolean;
};

// Helper functions for dynamic labels
function getDayName(daysAgo: number): string {
	const date = new Date();
	date.setDate(date.getDate() - daysAgo);
	return date.toLocaleDateString("en-US", { weekday: "long" });
}

function getMonthName(monthsAgo: number): string {
	const date = new Date();
	date.setMonth(date.getMonth() - monthsAgo);
	return date.toLocaleDateString("en-US", { month: "long" });
}

function getYear(yearsAgo: number): string {
	const date = new Date();
	date.setFullYear(date.getFullYear() - yearsAgo);
	return date.getFullYear().toString();
}

function getDateFromDaysAgo(daysAgo: number): number {
	const date = new Date();
	date.setDate(date.getDate() - daysAgo);
	date.setHours(12, 0, 0, 0); // Noon to avoid timezone issues
	return date.getTime();
}

function getDateFromMonthsAgo(monthsAgo: number): number {
	const date = new Date();
	date.setMonth(date.getMonth() - monthsAgo);
	date.setHours(12, 0, 0, 0);
	return date.getTime();
}

function getDateFromYearsAgo(yearsAgo: number): number {
	const date = new Date();
	date.setFullYear(date.getFullYear() - yearsAgo);
	date.setHours(12, 0, 0, 0);
	return date.getTime();
}

// Parse Spotify release date (can be "YYYY", "YYYY-MM", or "YYYY-MM-DD")
function parseReleaseDate(releaseDate: string): {
	year: number;
	month?: number;
	day?: number;
} {
	const parts = releaseDate.split("-");
	return {
		year: Number.parseInt(parts[0] ?? "0", 10),
		month: parts[1] ? Number.parseInt(parts[1], 10) : undefined,
		day: parts[2] ? Number.parseInt(parts[2], 10) : undefined,
	};
}

function getReleaseDayTimestamp(releaseDate: string): number {
	const parsed = parseReleaseDate(releaseDate);
	const date = new Date(parsed.year, (parsed.month ?? 1) - 1, parsed.day ?? 1);
	date.setHours(12, 0, 0, 0);
	return date.getTime();
}

function getReleaseMonthTimestamp(releaseDate: string): number {
	const parsed = parseReleaseDate(releaseDate);
	// Use middle of the month (15th)
	const date = new Date(parsed.year, (parsed.month ?? 1) - 1, 15);
	date.setHours(12, 0, 0, 0);
	return date.getTime();
}

function getReleaseYearTimestamp(releaseDate: string): number {
	const parsed = parseReleaseDate(releaseDate);
	// Use middle of the year (July 1st)
	const date = new Date(parsed.year, 6, 1);
	date.setHours(12, 0, 0, 0);
	return date.getTime();
}

function formatReleaseDayLabel(releaseDate: string): string {
	const parsed = parseReleaseDate(releaseDate);
	if (!parsed.day || !parsed.month) return "";
	const date = new Date(parsed.year, parsed.month - 1, parsed.day);
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function formatReleaseMonthLabel(releaseDate: string): string {
	const parsed = parseReleaseDate(releaseDate);
	if (!parsed.month) return "";
	const date = new Date(parsed.year, parsed.month - 1, 1);
	return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatReleaseYearLabel(releaseDate: string): string {
	const parsed = parseReleaseDate(releaseDate);
	return parsed.year.toString();
}

function formatReleaseDisplayDate(releaseDate: string): string {
	const parsed = parseReleaseDate(releaseDate);
	if (parsed.day && parsed.month) {
		const date = new Date(parsed.year, parsed.month - 1, parsed.day);
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	}
	if (parsed.month) {
		const date = new Date(parsed.year, parsed.month - 1, 1);
		return date.toLocaleDateString("en-US", {
			month: "short",
			year: "numeric",
		});
	}
	return parsed.year.toString();
}

type DateOption = {
	label: string;
	getTimestamp: () => number;
};

type DateRow = DateOption[];

// Generate release date options if available
function generateReleaseDateRow(releaseDate: string | undefined): DateRow {
	if (!releaseDate) return [];

	const parsed = parseReleaseDate(releaseDate);
	const options: DateOption[] = [];

	// Release day (only if full date available)
	if (parsed.day && parsed.month) {
		options.push({
			label: "Release date",
			getTimestamp: () => getReleaseDayTimestamp(releaseDate),
		});
	}

	// Release month (only if month available)
	if (parsed.month) {
		options.push({
			label: "Release month",
			getTimestamp: () => getReleaseMonthTimestamp(releaseDate),
		});
	}

	// Release year (always available)
	options.push({
		label: "Release year",
		getTimestamp: () => getReleaseYearTimestamp(releaseDate),
	});

	return options;
}

// Generate date options organized by rows
function generateDateRows(releaseDate: string | undefined): DateRow[] {
	const rows: DateRow[] = [];

	// Today (single centered) - always first
	rows.push([{ label: "Today", getTimestamp: () => getDateFromDaysAgo(0) }]);

	// Release date row (if available)
	const releaseRow = generateReleaseDateRow(releaseDate);
	if (releaseRow.length > 0) {
		rows.push(releaseRow);
	}

	// Yesterday, 2 days ago, 3 days ago
	rows.push([
		{ label: "Yesterday", getTimestamp: () => getDateFromDaysAgo(1) },
		{ label: "2 days ago", getTimestamp: () => getDateFromDaysAgo(2) },
		{ label: "3 days ago", getTimestamp: () => getDateFromDaysAgo(3) },
	]);

	// Day names for 4, 5, 6 days ago
	rows.push([
		{ label: getDayName(4), getTimestamp: () => getDateFromDaysAgo(4) },
		{ label: getDayName(5), getTimestamp: () => getDateFromDaysAgo(5) },
		{ label: getDayName(6), getTimestamp: () => getDateFromDaysAgo(6) },
	]);

	// Last week, 2 weeks ago, 3 weeks ago
	rows.push([
		{ label: "Last week", getTimestamp: () => getDateFromDaysAgo(7) },
		{ label: "2 weeks ago", getTimestamp: () => getDateFromDaysAgo(14) },
		{ label: "3 weeks ago", getTimestamp: () => getDateFromDaysAgo(21) },
	]);

	// Last month, 2 months ago, 3 months ago
	rows.push([
		{ label: "Last month", getTimestamp: () => getDateFromMonthsAgo(1) },
		{ label: "2 months ago", getTimestamp: () => getDateFromMonthsAgo(2) },
		{ label: "3 months ago", getTimestamp: () => getDateFromMonthsAgo(3) },
	]);

	// Month names for 4, 5, 6 months ago
	rows.push([
		{ label: getMonthName(4), getTimestamp: () => getDateFromMonthsAgo(4) },
		{ label: getMonthName(5), getTimestamp: () => getDateFromMonthsAgo(5) },
		{ label: getMonthName(6), getTimestamp: () => getDateFromMonthsAgo(6) },
	]);

	// Month names for 7, 8, 9 months ago
	rows.push([
		{ label: getMonthName(7), getTimestamp: () => getDateFromMonthsAgo(7) },
		{ label: getMonthName(8), getTimestamp: () => getDateFromMonthsAgo(8) },
		{ label: getMonthName(9), getTimestamp: () => getDateFromMonthsAgo(9) },
	]);

	// Month names for 10, 11 months ago, Last year
	rows.push([
		{ label: getMonthName(10), getTimestamp: () => getDateFromMonthsAgo(10) },
		{ label: getMonthName(11), getTimestamp: () => getDateFromMonthsAgo(11) },
		{ label: "Last year", getTimestamp: () => getDateFromYearsAgo(1) },
	]);

	// Year names for 2, 3, 4 years ago
	rows.push([
		{ label: getYear(2), getTimestamp: () => getDateFromYearsAgo(2) },
		{ label: getYear(3), getTimestamp: () => getDateFromYearsAgo(3) },
		{ label: getYear(4), getTimestamp: () => getDateFromYearsAgo(4) },
	]);

	return rows;
}

export function AddListenDrawer({
	track,
	open,
	onOpenChange,
	onSave,
	isSaving,
}: AddListenDrawerProps) {
	const dateRows = generateDateRows(track?.releaseDate);

	function handleOptionClick(getTimestamp: () => number) {
		if (isSaving) return;
		onSave(getTimestamp());
	}

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent>
				<div className="mx-auto w-full max-w-sm">
					<DrawerHeader className="text-center">
						{/* Album Art */}
						<div className="mx-auto mb-2 h-20 w-20 overflow-hidden rounded-lg bg-muted shadow-md">
							{track?.albumImageUrl ? (
								<Image
									src={track.albumImageUrl}
									alt={track.albumName ?? track.trackName}
									width={80}
									height={80}
									className="h-full w-full object-cover"
								/>
							) : (
								<div className="flex h-full w-full items-center justify-center">
									<Disc3 className="h-10 w-10 text-muted-foreground" />
								</div>
							)}
						</div>
						<DrawerTitle>{track?.albumName ?? "Unknown Album"}</DrawerTitle>
						<DrawerDescription>
							{track?.artistName}
							{track?.releaseDate && (
								<>
									{" · "}
									{formatReleaseDisplayDate(track.releaseDate)}
								</>
							)}
						</DrawerDescription>
					</DrawerHeader>

					{/* Date Options */}
					<div className="p-4 pb-8">
						<p className="mb-3 text-center text-muted-foreground text-sm">
							When did you listen?
						</p>

						{isSaving ? (
							<div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
								<Loader2 className="h-5 w-5 animate-spin" />
								<span>Adding listen...</span>
							</div>
						) : (
							<div className="flex flex-col gap-2">
								{dateRows.map((row, rowIndex) => (
									<div
										key={rowIndex}
										className={
											row.length === 1
												? "flex justify-center"
												: "grid grid-cols-3 gap-2"
										}
									>
										{row.map((option) => (
											<button
												key={option.label}
												type="button"
												onClick={() => handleOptionClick(option.getTimestamp)}
												disabled={isSaving}
												className="whitespace-nowrap rounded-lg border border-muted-foreground/20 px-3 py-2.5 font-medium text-sm transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary active:bg-primary active:text-primary-foreground"
											>
												{option.label}
											</button>
										))}
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</DrawerContent>
		</Drawer>
	);
}
