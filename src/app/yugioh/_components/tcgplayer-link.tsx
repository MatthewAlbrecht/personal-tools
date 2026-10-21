"use client";

import { useForm } from "@tanstack/react-form";
import { useAction } from "convex/react";
import { ExternalLink } from "lucide-react";
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
 * link once found, or a paste field (with a search link) when it wasn't.
 */
export function TcgplayerLink({
	cardName,
	candidate,
}: {
	cardName: string;
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
			<OutLink
				href={tcgplayer.productUrl}
				label={`TCGplayer product page for ${candidate.setCode} ${candidate.rarity}`}
			>
				TCGplayer product page
			</OutLink>
		);
	}

	return (
		<PasteProductUrl
			key={candidate.printingId}
			cardName={cardName}
			candidate={candidate}
		/>
	);
}

function PasteProductUrl({
	cardName,
	candidate,
}: {
	cardName: string;
	candidate: CandidatePrinting;
}): React.ReactElement {
	const setProductUrl = useAction(api.yugioh.tcgplayer.setProductUrl);
	const schema = productUrlSchema({ cardName, rarity: candidate.rarity });
	const form = useForm({
		defaultValues: { url: "" },
		validators: { onSubmit: schema },
		onSubmit: async ({ value, formApi }) => {
			try {
				await setProductUrl({
					printingId: candidate.printingId,
					url: value.url,
				});
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
								Couldn't find it. Paste the product URL.
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
							<div>
								<OutLink
									href={candidate.tcgplayer.searchUrl}
									label={`Search TCGplayer for ${candidate.setCode}`}
								>
									Search TCGplayer
								</OutLink>
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
