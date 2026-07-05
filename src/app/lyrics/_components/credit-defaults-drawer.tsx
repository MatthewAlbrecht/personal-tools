"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "~/components/ui/drawer";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { api } from "../../../../convex/_generated/api";

export function CreditDefaultsDrawer({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const creditLabels = useQuery(
		api.geniusCreditLabels.listCreditLabels,
		open ? {} : "skip",
	);
	const ignoredCreditLabels = useQuery(
		api.geniusCreditLabels.listIgnoredCreditLabels,
		open ? {} : "skip",
	);
	const refreshCreditLabels = useMutation(
		api.geniusCreditLabels.refreshCreditLabels,
	);
	const setCreditLabelHiddenByDefault = useMutation(
		api.geniusCreditLabels.setCreditLabelHiddenByDefault,
	);
	const addIgnoredCreditLabel = useMutation(
		api.geniusCreditLabels.addIgnoredCreditLabel,
	);
	const removeIgnoredCreditLabel = useMutation(
		api.geniusCreditLabels.removeIgnoredCreditLabel,
	);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [updatingKey, setUpdatingKey] = useState<string | null>(null);
	const [ignoredInput, setIgnoredInput] = useState("");
	const [isAddingIgnored, setIsAddingIgnored] = useState(false);
	const [removingIgnoredKey, setRemovingIgnoredKey] = useState<string | null>(
		null,
	);

	async function handleRefresh() {
		setIsRefreshing(true);
		try {
			const result = await refreshCreditLabels({});
			toast.success(
				`Found ${result.discoveredCount} labels (${result.insertedCount} new)`,
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to refresh credit labels",
			);
		} finally {
			setIsRefreshing(false);
		}
	}

	async function handleToggleHiddenByDefault(
		key: string,
		hiddenByDefault: boolean,
	) {
		setUpdatingKey(key);
		try {
			await setCreditLabelHiddenByDefault({ key, hiddenByDefault });
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to update credit label default",
			);
		} finally {
			setUpdatingKey(null);
		}
	}

	async function handleAddIgnoredLabel() {
		const trimmed = ignoredInput.trim();
		if (!trimmed) {
			toast.error("Enter a label or keyword to ignore");
			return;
		}

		setIsAddingIgnored(true);
		try {
			await addIgnoredCreditLabel({ label: trimmed });
			setIgnoredInput("");
			toast.success(`Ignoring labels containing "${trimmed}"`);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to add ignored credit label",
			);
		} finally {
			setIsAddingIgnored(false);
		}
	}

	async function handleRemoveIgnoredLabel(key: string) {
		setRemovingIgnoredKey(key);
		try {
			await removeIgnoredCreditLabel({ key });
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to remove ignored credit label",
			);
		} finally {
			setRemovingIgnoredKey(null);
		}
	}

	const isLoading =
		creditLabels === undefined || ignoredCreditLabels === undefined;

	return (
		<Drawer open={open} onOpenChange={onOpenChange} direction="right">
			<DrawerContent className="flex h-full w-full flex-col sm:max-w-md">
				<DrawerHeader className="shrink-0 gap-2 border-b pb-4 text-left">
					<DrawerTitle>Credit defaults</DrawerTitle>
					<DrawerDescription>
						Ignore labels you never want to see, or choose which discovered
						labels stay hidden unless shown on a track.
					</DrawerDescription>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="w-fit"
						disabled={isRefreshing}
						onClick={() => void handleRefresh()}
					>
						{isRefreshing ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Scanning credits...
							</>
						) : (
							<>
								<RefreshCw className="mr-2 h-4 w-4" />
								Refresh labels
							</>
						)}
					</Button>
				</DrawerHeader>

				<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
					{isLoading ? (
						<div className="flex items-center gap-2 text-muted-foreground text-sm">
							<Loader2 className="h-4 w-4 animate-spin" />
							Loading credit labels...
						</div>
					) : (
						<div className="space-y-8">
							<section className="space-y-3">
								<div>
									<h3 className="font-medium text-sm">Ignored labels</h3>
									<p className="text-muted-foreground text-xs leading-snug">
										Any credit label containing one of these keywords is hidden
										everywhere and cannot be restored per track.
									</p>
								</div>
								<form
									className="flex gap-2"
									onSubmit={(event) => {
										event.preventDefault();
										void handleAddIgnoredLabel();
									}}
								>
									<Input
										value={ignoredInput}
										onChange={(event) => setIgnoredInput(event.target.value)}
										placeholder='e.g. "translation", "samples"'
										disabled={isAddingIgnored}
									/>
									<Button
										type="submit"
										variant="secondary"
										disabled={isAddingIgnored}
									>
										{isAddingIgnored ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											"Add"
										)}
									</Button>
								</form>
								{ignoredCreditLabels.length === 0 ? (
									<p className="text-muted-foreground text-sm">
										No ignored labels yet.
									</p>
								) : (
									<ul className="space-y-2">
										{ignoredCreditLabels.map((row) => (
											<li
												key={row._id}
												className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
											>
												<div className="min-w-0">
													<p className="truncate font-medium text-sm">
														{row.label}
													</p>
													<p className="text-muted-foreground text-xs">
														Matches labels containing this text
													</p>
												</div>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													className="shrink-0"
													disabled={removingIgnoredKey === row.key}
													onClick={() => void handleRemoveIgnoredLabel(row.key)}
													title={`Stop ignoring ${row.label}`}
												>
													{removingIgnoredKey === row.key ? (
														<Loader2 className="h-4 w-4 animate-spin" />
													) : (
														<X className="h-4 w-4" />
													)}
												</Button>
											</li>
										))}
									</ul>
								)}
							</section>

							<section className="space-y-3">
								<p className="text-muted-foreground text-xs leading-snug">
									Discovered labels appear here. Checked labels are hidden unless
									you show them on an individual track in the zine editor.
								</p>
								{creditLabels.length === 0 ? (
									<p className="text-muted-foreground text-sm">
										No manageable labels yet. Refresh to scan stored album and
										playlist credits.
									</p>
								) : (
									<ul className="space-y-3">
										{creditLabels.map((row) => (
											<li
												key={row._id}
												className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
											>
												<Label
													htmlFor={`credit-default-${row.key}`}
													className="min-w-0 flex-1 cursor-pointer truncate font-medium text-sm"
												>
													{row.label}
												</Label>
												<Checkbox
													id={`credit-default-${row.key}`}
													checked={row.hiddenByDefault}
													disabled={updatingKey === row.key}
													onCheckedChange={(checked) =>
														void handleToggleHiddenByDefault(
															row.key,
															checked === true,
														)
													}
												/>
											</li>
										))}
									</ul>
								)}
							</section>
						</div>
					)}
				</div>
			</DrawerContent>
		</Drawer>
	);
}
