"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "convex/react";
import { format, isToday } from "date-fns";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "~/components/ui/input-group";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { api } from "../../../../convex/_generated/api";
import { errorMessage } from "../_utils/errors";
import { importFeeRateSchema, newImportFeeRateSchema } from "../_utils/schemas";

const SAVE_FAILED = "Couldn't save. Try again.";

/** /yugioh/settings: the import fee table and exchange-rate freshness. */
export function SettingsPage(): React.ReactElement {
	const settings = useQuery(api.yugioh.pricing.getPricingSettings, {});

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
			<header className="flex flex-col gap-1">
				<Link
					href="/yugioh"
					className="-ml-1 flex w-fit items-center gap-0.5 rounded-sm text-muted-foreground text-sm outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
				>
					<ChevronLeft className="size-4" aria-hidden />
					Decks
				</Link>
				<h1 className="font-display font-semibold text-2xl md:text-3xl">
					Settings
				</h1>
			</header>

			{settings === undefined ? (
				<SettingsPageSkeleton />
			) : (
				<>
					<Card>
						<CardHeader>
							<CardTitle>Import fees</CardTitle>
							<CardDescription>
								Added to price and shipping for Listings from outside the United
								States. Correct a rate after a real purchase.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Country</TableHead>
										<TableHead className="w-32 text-right">Rate</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{settings.importFeeRates.map((rate) => (
										<TableRow key={rate.country}>
											<TableCell>
												<Label
													htmlFor={rateInputId(rate.country)}
													className="font-normal"
												>
													{rate.country}
												</Label>
											</TableCell>
											<TableCell className="py-1.5">
												<RateField
													key={`${rate.country}-${rate.percent}`}
													country={rate.country}
													percent={rate.percent}
												/>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
								<TableFooter className="bg-transparent">
									<TableRow>
										<TableCell className="font-normal text-muted-foreground">
											Other countries
										</TableCell>
										<TableCell className="pr-3 text-right font-normal text-muted-foreground tabular-nums">
											{settings.defaultImportFeePercent}%
										</TableCell>
									</TableRow>
								</TableFooter>
							</Table>
						</CardContent>
						<CardFooter className="border-t">
							<AddCountryForm />
						</CardFooter>
					</Card>
					<p className="text-muted-foreground text-sm">
						{exchangeRateLine(settings.exchangeRates)}
					</p>
				</>
			)}
		</div>
	);
}

function rateInputId(country: string): string {
	return `import-fee-${country.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

/** "Exchange rates updated today at 6:00 AM from Frankfurter (ECB)." */
function exchangeRateLine(
	rates: { fetchedAt: number; source: string } | null,
): string {
	if (rates === null) {
		return "Exchange rates haven't loaded yet. They refresh once a day.";
	}
	const when = isToday(rates.fetchedAt)
		? `today at ${format(rates.fetchedAt, "h:mm a")}`
		: format(rates.fetchedAt, "MMM d 'at' h:mm a");
	return `Exchange rates updated ${when} from ${rates.source}.`;
}

/** One country's rate, saved on blur or Enter. */
function RateField({
	country,
	percent,
}: {
	country: string;
	percent: number;
}): React.ReactElement {
	const setImportFeeRate = useMutation(api.yugioh.pricing.setImportFeeRate);
	const form = useForm({
		defaultValues: { percent: String(percent) },
		validators: {
			onChange: importFeeRateSchema,
			onSubmit: importFeeRateSchema,
		},
		onSubmit: async ({ value }) => {
			const next = Number(value.percent.trim());
			if (next === percent) return;
			try {
				await setImportFeeRate({ country, percent: next });
				toast.success(`${country} import fees set to ${next}%`);
			} catch (error) {
				toast.error(errorMessage(error, SAVE_FAILED));
			}
		},
	});

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				void form.handleSubmit();
			}}
		>
			<form.Field name="percent">
				{(field) => {
					const invalid =
						field.state.meta.isTouched && field.state.meta.errors.length > 0;
					return (
						<Field
							data-invalid={invalid || undefined}
							className="ml-auto w-28 text-right"
						>
							<InputGroup className="h-11 md:h-9">
								<InputGroupInput
									id={rateInputId(country)}
									inputMode="decimal"
									className="text-right text-base tabular-nums md:text-sm"
									value={field.state.value}
									aria-invalid={invalid || undefined}
									onChange={(event) => field.handleChange(event.target.value)}
									onBlur={() => {
										// Leaving a rate that can't be saved puts the saved one back.
										if (
											!importFeeRateSchema.safeParse(form.state.values).success
										) {
											form.reset();
											toast.error(
												`Not saved. ${country} is still ${percent}%.`,
											);
											return;
										}
										field.handleBlur();
										void form.handleSubmit();
									}}
								/>
								<InputGroupAddon align="inline-end">
									<InputGroupText>%</InputGroupText>
								</InputGroupAddon>
							</InputGroup>
							{invalid ? (
								<FieldError
									className="whitespace-normal"
									errors={field.state.meta.errors}
								/>
							) : null}
						</Field>
					);
				}}
			</form.Field>
		</form>
	);
}

/** Adds a country the table doesn't have yet, so its rate can differ from 10%. */
function AddCountryForm(): React.ReactElement {
	const setImportFeeRate = useMutation(api.yugioh.pricing.setImportFeeRate);
	const form = useForm({
		defaultValues: { country: "", percent: "" },
		validators: { onSubmit: newImportFeeRateSchema },
		onSubmit: async ({ value, formApi }) => {
			const country = value.country.trim();
			const percent = Number(value.percent.trim());
			try {
				await setImportFeeRate({ country, percent });
				// The new row lands in A-Z order, often out of view.
				toast.success(`${country} import fees set to ${percent}%`);
				formApi.reset();
			} catch (error) {
				toast.error(errorMessage(error, SAVE_FAILED));
			}
		},
	});

	return (
		<form
			className="w-full"
			onSubmit={(event) => {
				event.preventDefault();
				void form.handleSubmit();
			}}
		>
			<FieldGroup className="gap-4 md:flex-row md:items-start">
				<form.Field name="country">
					{(field) => {
						const invalid =
							field.state.meta.isTouched && field.state.meta.errors.length > 0;
						return (
							<Field data-invalid={invalid || undefined} className="md:flex-1">
								<FieldLabel htmlFor="new-import-fee-country">
									Add a country
								</FieldLabel>
								<Input
									id="new-import-fee-country"
									placeholder="As eBay writes it, like Japan"
									autoComplete="off"
									className="h-11 text-base md:h-9 md:text-sm"
									value={field.state.value}
									aria-invalid={invalid || undefined}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
								/>
								{invalid ? (
									<FieldError errors={field.state.meta.errors} />
								) : null}
							</Field>
						);
					}}
				</form.Field>
				<form.Field name="percent">
					{(field) => {
						const invalid =
							field.state.meta.isTouched && field.state.meta.errors.length > 0;
						return (
							<Field data-invalid={invalid || undefined} className="md:w-28">
								<FieldLabel htmlFor="new-import-fee-percent">Rate</FieldLabel>
								<InputGroup className="h-11 md:h-9">
									<InputGroupInput
										id="new-import-fee-percent"
										inputMode="decimal"
										className="text-right text-base tabular-nums md:text-sm"
										value={field.state.value}
										aria-invalid={invalid || undefined}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
									/>
									<InputGroupAddon align="inline-end">
										<InputGroupText>%</InputGroupText>
									</InputGroupAddon>
								</InputGroup>
								{invalid ? (
									<FieldError errors={field.state.meta.errors} />
								) : null}
							</Field>
						);
					}}
				</form.Field>
				<form.Subscribe selector={(state) => state.isSubmitting}>
					{(isSubmitting) => (
						<Button
							type="submit"
							variant="outline"
							className="h-11 md:mt-[1.375rem] md:h-9"
							disabled={isSubmitting}
						>
							{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
							Add country
						</Button>
					)}
				</form.Subscribe>
			</FieldGroup>
		</form>
	);
}

export function SettingsPageSkeleton(): React.ReactElement {
	return (
		<div className="flex flex-col gap-4">
			<Skeleton className="h-80 w-full rounded-xl" />
			<Skeleton className="h-4 w-72" />
		</div>
	);
}
