"use client";

import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { ReminderStep } from "~/lib/birthdays/types";

export type BirthdayFormValues = {
	name: string;
	month: number;
	day: number;
	birthYear?: number;
	entryPoint: ReminderStep;
};

const DEFAULT_VALUES: BirthdayFormValues = {
	name: "",
	month: 1,
	day: 1,
	entryPoint: "month",
};

type BirthdayFormState = {
	name: string;
	month: string;
	day: string;
	birthYear: string;
	entryPoint: ReminderStep;
};

export function BirthdayForm({
	initial,
	onSubmit,
	onCancel,
	submitLabel,
}: {
	initial?: BirthdayFormValues;
	onSubmit: (values: BirthdayFormValues) => Promise<void>;
	onCancel?: () => void;
	submitLabel: string;
}) {
	const [values, setValues] = useState<BirthdayFormState>(
		toFormState(initial ?? DEFAULT_VALUES),
	);
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsSubmitting(true);
		try {
			await onSubmit({
				name: values.name,
				month: Number(values.month),
				day: Number(values.day),
				birthYear: values.birthYear ? Number(values.birthYear) : undefined,
				entryPoint: values.entryPoint,
			});
			if (!initial) {
				setValues(toFormState(DEFAULT_VALUES));
			}
		} catch {
			return;
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
			<div className="grid gap-2">
				<Label htmlFor="birthday-name">Name</Label>
				<Input
					id="birthday-name"
					onChange={(event) =>
						setValues({ ...values, name: event.target.value })
					}
					placeholder="Jane Doe"
					required
					value={values.name}
				/>
			</div>

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
				<div className="grid gap-2">
					<Label htmlFor="birthday-month">Month</Label>
					<Input
						id="birthday-month"
						inputMode="numeric"
						max={12}
						min={1}
						onChange={(event) =>
							setValues({ ...values, month: event.target.value })
						}
						required
						type="number"
						value={values.month}
					/>
				</div>
				<div className="grid gap-2">
					<Label htmlFor="birthday-day">Day</Label>
					<Input
						id="birthday-day"
						inputMode="numeric"
						max={31}
						min={1}
						onChange={(event) =>
							setValues({ ...values, day: event.target.value })
						}
						required
						type="number"
						value={values.day}
					/>
				</div>
				<div className="col-span-2 grid gap-2 sm:col-span-1">
					<Label htmlFor="birthday-year">Birth year</Label>
					<Input
						id="birthday-year"
						inputMode="numeric"
						max={9999}
						min={1}
						onChange={(event) =>
							setValues({ ...values, birthYear: event.target.value })
						}
						placeholder="Optional"
						type="number"
						value={values.birthYear}
					/>
				</div>
			</div>

			<div className="grid gap-2">
				<Label htmlFor="birthday-entry-point">First reminder</Label>
				<select
					className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
					id="birthday-entry-point"
					onChange={(event) =>
						setValues({
							...values,
							entryPoint: event.target.value as ReminderStep,
						})
					}
					value={values.entryPoint}
				>
					<option value="month">One month out</option>
					<option value="week">One week out</option>
					<option value="day_before">Day before</option>
					<option value="day_of">Day of</option>
				</select>
				<p className="text-muted-foreground text-sm">
					Gets this reminder and everything after (week, day before, day of as
					applicable).
				</p>
			</div>

			<div className="flex items-center gap-2">
				<Button disabled={isSubmitting} type="submit">
					{isSubmitting ? "Saving..." : submitLabel}
				</Button>
				{onCancel ? (
					<Button
						disabled={isSubmitting}
						onClick={onCancel}
						type="button"
						variant="outline"
					>
						Cancel
					</Button>
				) : null}
			</div>
		</form>
	);
}

function toFormState(values: BirthdayFormValues): BirthdayFormState {
	return {
		name: values.name,
		month: String(values.month),
		day: String(values.day),
		birthYear: values.birthYear === undefined ? "" : String(values.birthYear),
		entryPoint: values.entryPoint,
	};
}
