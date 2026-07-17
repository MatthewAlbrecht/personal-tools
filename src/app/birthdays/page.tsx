"use client";

import { useMutation, useQuery } from "convex/react";
import { Cake } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { LoginPrompt } from "~/components/login-prompt";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { useAuthToken } from "~/lib/hooks/use-auth-token";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
	BirthdayForm,
	type BirthdayFormValues,
} from "./_components/birthday-form";
import { BirthdayList } from "./_components/birthday-list";

export default function BirthdaysPage() {
	const { userId, isLoading: authLoading } = useAuthToken();
	const birthdays = useQuery(api.birthdays.list, userId ? { userId } : "skip");
	const createBirthday = useMutation(api.birthdays.create);
	const updateBirthday = useMutation(api.birthdays.update);
	const removeBirthday = useMutation(api.birthdays.remove);
	const [editingId, setEditingId] = useState<Id<"birthdays"> | null>(null);
	const editingBirthday =
		birthdays?.find((birthday) => birthday._id === editingId) ?? null;

	async function handleSubmit(values: BirthdayFormValues): Promise<void> {
		if (!userId) return;

		try {
			const args = {
				userId,
				name: values.name,
				month: values.month,
				day: values.day,
				entryPoint: values.entryPoint,
				...(values.birthYear !== undefined
					? { birthYear: values.birthYear }
					: {}),
			};

			if (editingId) {
				await updateBirthday({ id: editingId, ...args });
				setEditingId(null);
				toast.success("Birthday updated");
			} else {
				await createBirthday(args);
				toast.success("Birthday added");
			}
		} catch (error) {
			console.error("Failed to save birthday:", error);
			toast.error(getErrorMessage(error, "Failed to save birthday"));
			throw error;
		}
	}

	async function handleDelete(item: Doc<"birthdays">): Promise<void> {
		if (
			!userId ||
			!window.confirm(`Delete ${item.name}'s birthday and reminders?`)
		) {
			return;
		}

		try {
			await removeBirthday({ id: item._id, userId });
			if (editingId === item._id) {
				setEditingId(null);
			}
			toast.success("Birthday deleted");
		} catch (error) {
			console.error("Failed to delete birthday:", error);
			toast.error(getErrorMessage(error, "Failed to delete birthday"));
		}
	}

	if (authLoading) {
		return <main className="mx-auto max-w-4xl px-4 py-8">Loading...</main>;
	}

	if (!userId) {
		return (
			<LoginPrompt
				icon={Cake}
				message="Please log in to track birthdays"
				redirectPath="/birthdays"
			/>
		);
	}

	return (
		<main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
			<header className="flex flex-col gap-2">
				<Link
					className="text-muted-foreground text-sm hover:underline"
					href="/"
				>
					Back to tools
				</Link>
				<h1 className="font-bold text-3xl tracking-tight">Birthday Tracker</h1>
				<p className="text-muted-foreground">
					Keep birthdays and their reminder schedules in one place.
				</p>
			</header>

			<Card>
				<CardHeader>
					<CardTitle>
						{editingBirthday ? `Edit ${editingBirthday.name}` : "Add person"}
					</CardTitle>
					<CardDescription>
						Choose when reminders should begin for this person.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<BirthdayForm
						key={editingBirthday?._id ?? "new"}
						initial={
							editingBirthday
								? {
										name: editingBirthday.name,
										month: editingBirthday.month,
										day: editingBirthday.day,
										birthYear: editingBirthday.birthYear,
										entryPoint: editingBirthday.entryPoint,
									}
								: undefined
						}
						onCancel={editingBirthday ? () => setEditingId(null) : undefined}
						onSubmit={handleSubmit}
						submitLabel={editingBirthday ? "Save changes" : "Add birthday"}
					/>
				</CardContent>
			</Card>

			<section className="flex flex-col gap-3">
				<h2 className="font-semibold text-xl">Birthdays</h2>
				{birthdays === undefined ? (
					<p className="text-muted-foreground text-sm">Loading birthdays...</p>
				) : (
					<BirthdayList
						items={birthdays}
						onDelete={(item) => void handleDelete(item)}
						onEdit={(item) => setEditingId(item._id)}
					/>
				)}
			</section>
		</main>
	);
}

function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}
