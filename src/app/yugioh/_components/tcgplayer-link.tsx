"use client";

import { useForm } from "@tanstack/react-form";
import { useAction } from "convex/react";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import type * as React from "react";
import { Button } from "~/components/ui/button";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { api } from "../../../../convex/_generated/api";
import { errorMessage } from "../_utils/errors";
import { productUrlSchema } from "../_utils/schemas";
import type { CandidatePrinting } from "../_utils/types";

/**
 * A Printing's TCGplayer product link: a spinner while AI looks for it, the
 * link once found (with "Change TCGplayer link" to paste another), or a paste
 * field (with a search link) when it wasn't.
 */
export function TcgplayerLink({
	candidate,
}: {
	candidate: CandidatePrinting;
}): React.ReactElement {
	const { tcgplayer } = candidate;

	if (tcgplayer.status === "searching") {
		return (
			<output className="flex items-center gap-2 text-muted-foreground text-xs">
				<Spinner />
				Finding TCGplayer page…
			</output>
		);
	}

	if (tcgplayer.status === "found" && tcgplayer.productUrl) {
		return (
			<LinkedProduct
				key={candidate.printingId}
				candidate={candidate}
				productUrl={tcgplayer.productUrl}
			/>
		);
	}

	return <PasteProductUrl key={candidate.printingId} candidate={candidate} />;
}

/**
 * The linked product page, and "Change TCGplayer link", which opens the same
 * checked paste field an unlinked Printing has.
 */
function LinkedProduct({
	candidate,
	productUrl,
}: {
	candidate: CandidatePrinting;
	productUrl: string;
}): React.ReactElement {
	const [changing, setChanging] = useState(false);

	if (changing) {
		return (
			<PasteProductUrl
				candidate={candidate}
				label="Paste the right product URL."
				onSaved={() => setChanging(false)}
				onCancel={() => setChanging(false)}
			/>
		);
	}

	return (
		<div className="flex flex-wrap items-center gap-x-4">
			<OutLink
				href={productUrl}
				label={`TCGplayer product page for ${candidate.setCode} ${candidate.rarity}`}
			>
				TCGplayer product page
			</OutLink>
			<Button
				type="button"
				variant="link"
				size="sm"
				className="h-auto min-h-11 w-fit p-0 text-muted-foreground text-xs md:min-h-0"
				aria-label={`Change TCGplayer link for ${candidate.setCode} ${candidate.rarity}`}
				onClick={() => setChanging(true)}
			>
				Change TCGplayer link
			</Button>
		</div>
	);
}

function PasteProductUrl({
	candidate,
	label = "Couldn't find it. Paste the product URL.",
	onSaved,
	onCancel,
}: {
	candidate: CandidatePrinting;
	label?: string;
	onSaved?: () => void;
	onCancel?: () => void;
}): React.ReactElement {
	const setProductUrl = useAction(api.yugioh.tcgplayer.setProductUrl);
	const form = useForm({
		defaultValues: { url: "" },
		validators: { onSubmit: productUrlSchema },
		onSubmit: async ({ value, formApi }) => {
			try {
				await setProductUrl({
					printingId: candidate.printingId,
					url: value.url,
				});
				onSaved?.();
			} catch (error) {
				formApi.setFieldMeta("url", (meta) => ({
					...meta,
					errorMap: {
						...meta.errorMap,
						onSubmit: [
							{
								message: errorMessage(
									error,
									"Couldn't save the link. Try again.",
								),
							},
						],
					},
				}));
			}
		},
	});
	const id = `tcgplayer-url-${candidate.printingId}`;

	return (
		<form
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				event.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<form.Field name="url">
				{(field) => {
					const invalid = !field.state.meta.isValid;
					return (
						<Field data-invalid={invalid} className="gap-2">
							<FieldLabel
								htmlFor={id}
								className="font-normal text-muted-foreground text-xs"
							>
								{label}
							</FieldLabel>
							<div className="flex gap-2">
								<Input
									id={id}
									type="url"
									inputMode="url"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
									aria-invalid={invalid}
									autoComplete="off"
									autoFocus={onCancel !== undefined}
									spellCheck={false}
									placeholder="https://www.tcgplayer.com/product/…"
									className="h-11 min-w-0 flex-1 text-base md:h-9 md:text-sm"
								/>
								<form.Subscribe selector={(state) => state.isSubmitting}>
									{(isSubmitting) => (
										<Button
											type="submit"
											variant="outline"
											className="h-11 md:h-9"
											disabled={isSubmitting}
										>
											{isSubmitting ? (
												<Spinner data-icon="inline-start" />
											) : null}
											Save link
										</Button>
									)}
								</form.Subscribe>
							</div>
							{invalid ? <FieldError errors={field.state.meta.errors} /> : null}
							<div className="flex flex-wrap items-center gap-x-4">
								<OutLink
									href={candidate.tcgplayer.searchUrl}
									label={`Search TCGplayer for ${candidate.setCode}`}
								>
									Search TCGplayer
								</OutLink>
								{onCancel ? (
									<Button
										type="button"
										variant="link"
										size="sm"
										className="h-auto min-h-11 w-fit p-0 text-muted-foreground text-xs md:min-h-0"
										onClick={onCancel}
									>
										Keep current link
									</Button>
								) : null}
							</div>
						</Field>
					);
				}}
			</form.Field>
		</form>
	);
}

function OutLink({
	href,
	label,
	children,
}: {
	href: string;
	label: string;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<Button
			variant="link"
			size="sm"
			className="h-auto min-h-11 w-fit p-0 text-xs has-[>svg]:px-0 md:min-h-0"
			asChild
		>
			<a
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				aria-label={`${label} (opens in a new tab)`}
			>
				{children}
				<ExternalLink data-icon="inline-end" />
			</a>
		</Button>
	);
}
