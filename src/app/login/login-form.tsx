"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export function LoginForm() {
	const router = useRouter();
	const params = useSearchParams();
	const next = params?.get("next") || "/";
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setIsSubmitting(true);
		setError(null);
		const body = new FormData();
		body.set("username", username);
		body.set("password", password);
		const res = await fetch("/api/auth", { method: "POST", body });
		setIsSubmitting(false);
		if (res.ok) {
			router.replace(next);
		} else {
			setError("Invalid credentials");
		}
	}

	return (
		<main className="mx-auto max-w-sm px-4 py-10">
			<h1 className="mb-6 font-semibold text-2xl">Sign in</h1>
			<form onSubmit={onSubmit} className="space-y-4">
				<div className="flex flex-col gap-1">
					<Label htmlFor="username">Username</Label>
					<Input
						id="username"
						value={username}
						onChange={(e) => setUsername(e.target.value)}
					/>
				</div>
				<div className="flex flex-col gap-1">
					<Label htmlFor="password">Password</Label>
					<Input
						id="password"
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
					/>
				</div>
				{error ? <p className="text-red-500 text-sm">{error}</p> : null}
				<Button type="submit" disabled={isSubmitting} variant="outline">
					{isSubmitting ? "Signing in..." : "Sign in"}
				</Button>
			</form>
		</main>
	);
}
