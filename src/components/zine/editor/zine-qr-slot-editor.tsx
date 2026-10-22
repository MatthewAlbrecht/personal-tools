"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	type ZineEditorPersistStatus,
	useZineEditorPersist,
} from "~/components/zine/editor/use-zine-editor-persist";
import { ZineField } from "~/components/zine/editor/zine-field";
import type { Id } from "../../../../convex/_generated/dataModel";

export type ZineQrService = "spotify" | "appleMusic";

type ZineQrSlotCallbacks = {
	onStatusChange: (id: string, status: ZineEditorPersistStatus) => void;
	generateUploadUrl: () => Promise<string>;
	saveImage: (
		service: ZineQrService,
		image: { qrImageUrl: string } | { storageId: Id<"_storage"> },
	) => Promise<{ qrImageUrl?: string }>;
	saveShow: (service: ZineQrService, show: boolean) => Promise<unknown>;
};

/** Spotify and Apple Music QR codes for the back cover, side by side. */
export function ZineBackCoverQrEditor({
	idPrefix,
	spotify,
	appleMusic,
	...callbacks
}: ZineQrSlotCallbacks & {
	idPrefix: string;
	spotify: { imageUrl?: string; show: boolean };
	appleMusic: { imageUrl?: string; show: boolean };
}): ReactNode {
	return (
		<div className="grid gap-8 sm:grid-cols-2">
			<ZineQrSlotEditor
				{...callbacks}
				idPrefix={idPrefix}
				service="spotify"
				label="Spotify"
				initialImageUrl={spotify.imageUrl}
				initialShow={spotify.show}
			/>
			<ZineQrSlotEditor
				{...callbacks}
				idPrefix={idPrefix}
				service="appleMusic"
				label="Apple Music"
				initialImageUrl={appleMusic.imageUrl}
				initialShow={appleMusic.show}
			/>
		</div>
	);
}

/** One back-cover QR code: image by URL or upload, plus a show toggle. */
function ZineQrSlotEditor({
	idPrefix,
	service,
	label,
	initialImageUrl,
	initialShow,
	onStatusChange,
	generateUploadUrl,
	saveImage,
	saveShow,
}: ZineQrSlotCallbacks & {
	idPrefix: string;
	service: ZineQrService;
	label: string;
	initialImageUrl?: string;
	initialShow: boolean;
}): ReactNode {
	const statusKey = `qr-${service}`;
	const [showOnBackCover, setShowOnBackCover] = useState(initialShow);
	const [isUploading, setIsUploading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const urlPersist = useZineEditorPersist(
		initialImageUrl ?? "",
		async (nextUrl) => {
			await saveImage(service, { qrImageUrl: nextUrl.trim() });
		},
	);

	// Syncs the checkbox with the server value when it changes elsewhere.
	useEffect(() => {
		setShowOnBackCover(initialShow);
	}, [initialShow]);

	// Reports this slot's save status to the editor shell.
	useEffect(() => {
		onStatusChange(statusKey, urlPersist.status);
	}, [onStatusChange, statusKey, urlPersist.status]);

	const resolvedImageUrl = urlPersist.value.trim() || undefined;
	const inputIdPrefix = `${idPrefix}-qr-${service}`;

	async function handleFileUpload(file: File | undefined): Promise<void> {
		if (!file) return;
		const maxBytes = 15 * 1024 * 1024;
		if (file.size > maxBytes) {
			toast.error("Image must be 15 MB or smaller");
			return;
		}
		setIsUploading(true);
		onStatusChange(statusKey, "saving");
		try {
			const uploadUrl = await generateUploadUrl();
			const response = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": file.type },
				body: file,
			});
			if (!response.ok) throw new Error("Upload failed");
			const { storageId } = (await response.json()) as { storageId: string };
			const result = await saveImage(service, {
				storageId: storageId as Id<"_storage">,
			});
			urlPersist.setValue(result.qrImageUrl ?? "");
			toast.success(`${label} QR uploaded`);
			onStatusChange(statusKey, "saved");
		} catch {
			toast.error(`Failed to upload ${label} QR`);
			onStatusChange(statusKey, "error");
		} finally {
			setIsUploading(false);
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	}

	async function handleShowToggle(checked: boolean): Promise<void> {
		setShowOnBackCover(checked);
		try {
			await saveShow(service, checked);
		} catch {
			setShowOnBackCover(!checked);
			toast.error(`Failed to update ${label} visibility`);
		}
	}

	return (
		<div className="space-y-3">
			<p className="font-medium text-sm">{label}</p>
			{resolvedImageUrl ? (
				<img
					alt={`${label} QR preview`}
					className="h-24 w-24 rounded-sm bg-white object-contain"
					src={resolvedImageUrl}
				/>
			) : null}
			<ZineField
				label="Image URL"
				htmlFor={`${inputIdPrefix}-url`}
				placement="Back cover, bottom-left."
			>
				<Input
					id={`${inputIdPrefix}-url`}
					type="url"
					value={urlPersist.value}
					placeholder="https://…"
					onChange={(event) => urlPersist.setValue(event.currentTarget.value)}
				/>
			</ZineField>
			<p className="text-center text-muted-foreground text-xs">or</p>
			<div className="space-y-2">
				<input
					ref={fileInputRef}
					accept="image/jpeg,image/png,image/webp,image/gif"
					className="sr-only"
					id={`${inputIdPrefix}-file`}
					type="file"
					onChange={(event) => {
						void handleFileUpload(event.target.files?.[0]);
					}}
				/>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={isUploading}
					onClick={() => fileInputRef.current?.click()}
				>
					{isUploading ? "Uploading…" : "Choose file"}
				</Button>
			</div>
			<div className="flex items-center gap-2">
				<Checkbox
					id={`${inputIdPrefix}-show`}
					checked={showOnBackCover}
					disabled={!resolvedImageUrl || isUploading}
					onCheckedChange={(checked) => {
						void handleShowToggle(checked === true);
					}}
				/>
				<Label
					htmlFor={`${inputIdPrefix}-show`}
					className="font-normal text-sm"
				>
					Show on back cover
				</Label>
			</div>
		</div>
	);
}
