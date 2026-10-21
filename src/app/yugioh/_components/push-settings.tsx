"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "convex/react";
import { Share } from "lucide-react";
import type * as React from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
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
	FieldContent,
	FieldDescription,
	FieldLabel,
} from "~/components/ui/field";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import { env } from "~/env";
import { api } from "../../../../convex/_generated/api";
import { errorMessage } from "../_utils/errors";
import {
	type PushSupport,
	currentSubscription,
	pushSupport,
	subscribeThisDevice,
	subscriptionArgs,
} from "../_utils/push";
import { pushAlertsSchema } from "../_utils/schemas";

const BLOCKED =
	"Notifications are blocked for this app. Allow them in your browser or iPhone Settings, then try again.";

/**
 * Settings: deal alerts on this device. The switch shows in browsers that
 * have push (the installed app on iPhone); an iPhone Safari tab gets the
 * add-to-home-screen steps instead.
 */
export function PushSettings(): React.ReactElement {
	const support = useSyncExternalStore(
		noSubscribe,
		pushSupport,
		(): PushSupport | null => null,
	);

	return (
		<Card id="notifications">
			<CardHeader>
				<CardTitle>Notifications</CardTitle>
				<CardDescription>
					A push for each new Great or Good deal on a Card you still need.
				</CardDescription>
			</CardHeader>
			{support === null ? (
				<CardContent>
					<Skeleton className="h-11 w-full" />
				</CardContent>
			) : support === "install" ? (
				<InstallSteps />
			) : support === "none" ? (
				<CardContent>
					<p className="text-muted-foreground text-sm">
						This browser can't show alerts. Use the app from your phone's home
						screen, or Chrome, Edge, Firefox or Safari on a computer.
					</p>
				</CardContent>
			) : env.NEXT_PUBLIC_VAPID_PUBLIC_KEY === undefined ? (
				<CardContent>
					<p className="text-muted-foreground text-sm">
						Alerts aren't set up yet: the app has no VAPID public key
						(NEXT_PUBLIC_VAPID_PUBLIC_KEY).
					</p>
				</CardContent>
			) : (
				<AlertsSwitch vapidPublicKey={env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
			)}
		</Card>
	);
}

/** On or off for this device, saved as soon as it's flipped. */
function AlertsSwitch({
	vapidPublicKey,
}: {
	vapidPublicKey: string;
}): React.ReactElement {
	// undefined while this device's subscription is being read.
	const [endpoint, setEndpoint] = useState<string | null | undefined>(
		undefined,
	);
	const saved = useQuery(
		api.yugioh.pushes.hasPushSubscription,
		endpoint ? { endpoint } : "skip",
	);
	const savePushSubscription = useMutation(
		api.yugioh.pushes.savePushSubscription,
	);
	const removePushSubscription = useMutation(
		api.yugioh.pushes.removePushSubscription,
	);
	const sendTestPush = useMutation(api.yugioh.pushes.sendTestPush);

	// Syncs with the browser's push subscription for this device.
	useEffect(() => {
		let current = true;
		void currentSubscription()
			.then((subscription) => {
				if (current) setEndpoint(subscription?.endpoint ?? null);
			})
			.catch(() => {
				if (current) setEndpoint(null);
			});
		return () => {
			current = false;
		};
	}, []);

	const on = endpoint != null && saved === true;
	const loading =
		endpoint === undefined || (endpoint !== null && saved === undefined);

	const form = useForm({
		defaultValues: { enabled: on },
		validators: { onSubmit: pushAlertsSchema },
		onSubmit: async ({ value }) => {
			try {
				if (value.enabled) {
					// Straight from the tap: iOS only prompts within a few seconds of it.
					const subscription = await subscribeThisDevice(vapidPublicKey);
					await savePushSubscription(subscriptionArgs(subscription));
					setEndpoint(subscription.endpoint);
					toast.success("Alerts are on for this device.");
				} else {
					const subscription = await currentSubscription();
					if (subscription) {
						await removePushSubscription({ endpoint: subscription.endpoint });
						await subscription.unsubscribe();
					}
					setEndpoint(null);
					toast.success("Alerts are off for this device.");
				}
			} catch (error) {
				toast.error(
					Notification.permission === "denied"
						? BLOCKED
						: errorMessage(error, "Couldn't change alerts. Try again."),
				);
			}
		},
	});

	async function sendTest(): Promise<void> {
		try {
			await sendTestPush({});
			toast.success("Test alert sent. It should arrive in a few seconds.");
		} catch (error) {
			toast.error(errorMessage(error, "Couldn't send a test alert."));
		}
	}

	return (
		<>
			<CardContent>
				<form.Field name="enabled">
					{(field) => (
						<form.Subscribe selector={(state) => state.isSubmitting}>
							{(submitting) => (
								<Field orientation="horizontal" className="min-h-11">
									<FieldContent>
										<FieldLabel htmlFor="push-alerts">
											Deal and auction alerts on this device
										</FieldLabel>
										<FieldDescription>
											Great and Good deals, 8am-11pm. Auctions 15 minutes before
											they end, any time.
										</FieldDescription>
										{!on && Notification.permission === "denied" ? (
											<FieldDescription className="text-destructive">
												{BLOCKED}
											</FieldDescription>
										) : null}
									</FieldContent>
									<Switch
										id="push-alerts"
										checked={on}
										disabled={loading || submitting}
										onCheckedChange={(checked) => {
											field.handleChange(checked);
											void form.handleSubmit();
										}}
									/>
								</Field>
							)}
						</form.Subscribe>
					)}
				</form.Field>
			</CardContent>
			{on ? (
				<CardFooter className="border-t">
					<Button
						type="button"
						variant="outline"
						className="h-11 md:h-9"
						onClick={() => void sendTest()}
					>
						Send a test alert
					</Button>
				</CardFooter>
			) : null}
		</>
	);
}

/** An iPhone Safari tab: push only exists once the app is on the home screen. */
function InstallSteps(): React.ReactElement {
	return (
		<CardContent className="flex flex-col gap-3 text-sm">
			<p>Alerts need the app on your home screen. In Safari:</p>
			<ol className="flex list-decimal flex-col gap-2 pl-5">
				<li>
					Tap Share{" "}
					<Share
						className="inline size-4 align-text-bottom text-muted-foreground"
						aria-label="(the square with an arrow)"
					/>
					.
				</li>
				<li>Tap Add to Home Screen, then Add.</li>
				<li>
					Open Yu-Gi-Oh from your home screen, come back to Settings and turn on
					alerts.
				</li>
			</ol>
		</CardContent>
	);
}

function noSubscribe(): () => void {
	return () => {};
}
