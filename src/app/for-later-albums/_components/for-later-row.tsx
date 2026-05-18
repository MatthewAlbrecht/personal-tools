"use client";

import type { ReactNode } from "react";
import { useMutation } from "convex/react";
import { Disc3, MoreHorizontal } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { AlbumRatingBadge } from "~/components/album-rating-badge";
import { AlbumUnrankedBadge } from "~/components/album-unranked-badge";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";
import { api } from "../../../../convex/_generated/api";
import { buildGoogleRateYourMusicSearchUrl } from "../../../../convex/_utils/google_rym_lucky_search";
import type { ForLaterAlbumRowData } from "../_utils/types";

function googleRymSearchUrl(row: ForLaterAlbumRowData): string {
	return buildGoogleRateYourMusicSearchUrl({
		artistName: row.artistName,
		albumName: row.name,
	});
}

/** open.spotify.com universal links open the app on mobile when installed. */
function buildSpotifyAlbumUrl(spotifyAlbumId: string): string {
	return `https://open.spotify.com/album/${spotifyAlbumId}`;
}

export function ForLaterRow({
	row,
	userId,
	onRate,
	onAddGenreKey,
	onAddDescriptorKey,
}: {
	row: ForLaterAlbumRowData;
	userId: string;
	onRate?: () => void;
	onAddGenreKey?: (key: string) => void;
	onAddDescriptorKey?: (key: string) => void;
}) {
	const setRymNotOnSite = useMutation(
		api.forLaterAlbums.setForLaterAlbumRymNotOnSite,
	);
	const setMarkedAsSingle = useMutation(
		api.forLaterAlbums.setForLaterAlbumMarkedAsSingle,
	);

	async function handleSetRymNotOnSite(notOnSite: boolean): Promise<void> {
		try {
			await setRymNotOnSite({
				userId,
				itemId: row.albumItemId,
				notOnSite,
			});
			toast.success(
				notOnSite ? "Marked as not on RYM" : "Cleared not-on-RYM mark",
			);
		} catch (error) {
			console.error("Failed to update RYM availability:", error);
			toast.error("Could not update RYM availability");
		}
	}

	async function handleSetMarkedAsSingle(marked: boolean): Promise<void> {
		try {
			await setMarkedAsSingle({
				userId,
				itemId: row.albumItemId,
				markedAsSingle: marked,
			});
			toast.success(
				marked ? "Marked as single (hidden from list)" : "Cleared single mark",
			);
		} catch (error) {
			console.error("Failed to update single mark:", error);
			toast.error("Could not update single mark");
		}
	}

	return (
		<article className="relative rounded-xl border bg-card p-3 transition-colors hover:bg-muted/30">
			<div className="flex gap-3">
				<div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
					{row.imageUrl ? (
						<Image
							src={row.imageUrl}
							alt={row.name}
							fill
							className="object-cover"
							sizes="64px"
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center">
							<Disc3 className="h-7 w-7 text-muted-foreground/60" />
						</div>
					)}
				</div>
				<div className="flex min-w-0 flex-1 flex-col">
					<div className="space-y-2">
						<div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
							<div className="min-w-0">
								<h2 className="truncate font-semibold text-base">{row.name}</h2>
								<p className="truncate text-muted-foreground text-sm">
									{row.artistName}
									{row.releaseYear ? ` · ${row.releaseYear}` : ""}
								</p>
								<p className="text-muted-foreground text-xs">
									Added {formatDate(row.playlistAddedAt ?? row.firstSeenAt)} ·
									Seen {formatDate(row.lastSeenAt)}
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-2 md:justify-end">
								{row.rating !== undefined ? (
									<AlbumRatingBadge
										rating={row.rating}
										onClick={
											onRate
												? (event) => {
														event.stopPropagation();
														onRate();
													}
												: undefined
										}
									/>
								) : row.hasListened && onRate ? (
									<AlbumUnrankedBadge
										onClick={(event) => {
											event.stopPropagation();
											onRate();
										}}
									/>
								) : row.hasListened ? (
									<AlbumUnrankedBadge />
								) : null}
								{row.rymNotOnSite ? (
									<Badge variant="secondary">Not on RYM</Badge>
								) : null}
								{!row.rymUrl?.trim() && !row.rymNotOnSite ? (
									<RowExternalLink
										href={googleRymSearchUrl(row)}
										ariaLabel={`Search for ${row.name} on Google for RYM`}
									>
										<GoogleLogoIcon className="size-5" />
									</RowExternalLink>
								) : null}
								{row.spotifyAlbumId.trim() ? (
									<RowExternalLink
										href={buildSpotifyAlbumUrl(row.spotifyAlbumId)}
										ariaLabel={`Open ${row.name} on Spotify`}
									>
										<SpotifyLogoIcon className="size-5 text-[#1DB954]" />
									</RowExternalLink>
								) : null}
								{row.rymUrl ? (
									<RowExternalLink
										href={row.rymUrl}
										ariaLabel={`Open ${row.name} on Rate Your Music`}
									>
										<Image
											src="/sonemic-512.png"
											alt=""
											width={20}
											height={20}
											className="size-5 rounded-sm object-contain"
										/>
									</RowExternalLink>
								) : null}
							</div>
						</div>
						<TagGroups
							row={row}
							onAddGenreKey={onAddGenreKey}
							onAddDescriptorKey={onAddDescriptorKey}
						/>
					</div>
				</div>
			</div>
			<div className="absolute right-0 bottom-0 z-10">
				<ForLaterRowActionsMenu
					row={row}
					onSetRymNotOnSite={handleSetRymNotOnSite}
					onSetMarkedAsSingle={handleSetMarkedAsSingle}
				/>
			</div>
		</article>
	);
}

function RowExternalLink({
	href,
	ariaLabel,
	children,
}: {
	href: string;
	ariaLabel: string;
	children: ReactNode;
}) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={ariaLabel}
			className="inline-flex shrink-0 items-center opacity-80 transition-opacity hover:opacity-100"
		>
			{children}
		</a>
	);
}

function SpotifyLogoIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			role="img"
			aria-hidden="true"
			fill="currentColor"
		>
			<path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
		</svg>
	);
}

function GoogleLogoIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			role="img"
			aria-hidden="true"
		>
			<path
				fill="#4285F4"
				d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
			/>
			<path
				fill="#34A853"
				d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
			/>
			<path
				fill="#FBBC05"
				d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
			/>
			<path
				fill="#EA4335"
				d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
			/>
		</svg>
	);
}

function ForLaterRowActionsMenu({
	row,
	onSetRymNotOnSite,
	onSetMarkedAsSingle,
}: {
	row: ForLaterAlbumRowData;
	onSetRymNotOnSite: (notOnSite: boolean) => Promise<void>;
	onSetMarkedAsSingle: (marked: boolean) => Promise<void>;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-8 shrink-0 p-0"
					aria-label="Open album actions"
				>
					<MoreHorizontal className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-52">
				<DropdownMenuLabel>Actions</DropdownMenuLabel>
				{row.markedAsSingle ? (
					<DropdownMenuItem onSelect={() => void onSetMarkedAsSingle(false)}>
						Clear single mark
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem onSelect={() => void onSetMarkedAsSingle(true)}>
						Mark as single
					</DropdownMenuItem>
				)}
				{row.rymNotOnSite ? (
					<DropdownMenuItem onSelect={() => void onSetRymNotOnSite(false)}>
						Clear not-on-RYM mark
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem onSelect={() => void onSetRymNotOnSite(true)}>
						Mark as Not on RYM
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function TagGroups({
	row,
	onAddGenreKey,
	onAddDescriptorKey,
}: {
	row: ForLaterAlbumRowData;
	onAddGenreKey?: (key: string) => void;
	onAddDescriptorKey?: (key: string) => void;
}) {
	return (
		<div className="space-y-1 pr-10">
			<TagLine
				label="Primary"
				tags={row.primaryGenres}
				variant="primary"
				onPickTag={onAddGenreKey}
			/>
			<TagLine
				label="Secondary"
				tags={row.secondaryGenres}
				variant="secondary"
				onPickTag={onAddGenreKey}
			/>
			<TagLine
				label="Descriptors"
				tags={row.descriptors}
				variant="descriptors"
				onPickTag={onAddDescriptorKey}
			/>
		</div>
	);
}

function TagLine({
	label,
	tags,
	variant,
	onPickTag,
}: {
	label: string;
	tags: Array<{ key: string; label: string }>;
	variant: "primary" | "secondary" | "descriptors";
	onPickTag?: (key: string) => void;
}) {
	if (tags.length === 0) {
		return null;
	}

	const body = tags.map((tag, index) => (
		<span key={tag.key}>
			{index > 0 ? ", " : null}
			{onPickTag ? (
				<button
					type="button"
					className={cn(
						"cursor-pointer rounded-xs text-left underline-offset-2 hover:underline",
						variant === "descriptors" && "text-muted-foreground",
					)}
					onClick={() => onPickTag(tag.key)}
				>
					{tag.label}
				</button>
			) : (
				tag.label
			)}
		</span>
	));

	if (variant === "descriptors") {
		return (
			<p className="text-muted-foreground text-xs">
				<span className="text-muted-foreground">{label}: </span>
				{body}
			</p>
		);
	}

	return (
		<p
			className={cn(
				variant === "primary" && "text-sm",
				variant === "secondary" && "text-xs",
			)}
		>
			<span className="text-muted-foreground">{label}: </span>
			{body}
		</p>
	);
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
