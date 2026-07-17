import {
	Body,
	Container,
	Head,
	Heading,
	Hr,
	Html,
	Section,
	Text,
} from "@react-email/components";
import * as React from "react";
import { stepLabel } from "~/lib/birthdays/reminders";
import type { DueReminder } from "~/lib/birthdays/types";

type BirthdayDigestEmailProps = {
	dueItems: DueReminder[];
};

function formatBirthdayDate(month: number, day: number): string {
	return `${month}/${day}`;
}

function formatDaysUntil(days: number): string {
	if (days === 0) {
		return "Birthday is today";
	}
	if (days === 1) {
		return "1 day until birthday";
	}
	return `${days} days until birthday`;
}

export function BirthdayDigestEmail({ dueItems }: BirthdayDigestEmailProps) {
	return (
		<Html lang="en">
			<Head />
			<Body
				style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#ffffff" }}
			>
				<Container
					style={{ maxWidth: "600px", margin: "0 auto", padding: "20px" }}
				>
					<Heading
						style={{
							color: "#111827",
							borderBottom: "2px solid #ec4899",
							paddingBottom: "8px",
							marginBottom: "20px",
							fontSize: "28px",
							margin: "0 0 20px 0",
						}}
					>
						🎂 Birthday Reminders
					</Heading>

					<Text
						style={{ fontSize: "16px", color: "#374151", marginBottom: "20px" }}
					>
						You have {dueItems.length} birthday reminder
						{dueItems.length > 1 ? "s" : ""} due today.
					</Text>

					{dueItems.map((item) => (
						<Section
							key={`${item.birthdayId}-${item.step}`}
							style={{
								border: "1px solid #e5e7eb",
								borderRadius: "8px",
								padding: "16px",
								marginBottom: "16px",
							}}
						>
							<Heading
								as="h3"
								style={{
									margin: "0 0 8px 0",
									color: "#111827",
									fontSize: "18px",
								}}
							>
								{item.name}
							</Heading>

							<Text
								style={{
									fontSize: "14px",
									color: "#6b7280",
									margin: "0 0 4px 0",
								}}
							>
								<strong>Birthday:</strong>{" "}
								{formatBirthdayDate(item.month, item.day)}
								{item.age !== undefined && (
									<span>
										{" "}
										• <strong>Turns:</strong> {item.age}
									</span>
								)}
							</Text>

							<Text
								style={{
									fontSize: "14px",
									color: "#6b7280",
									margin: "0 0 4px 0",
								}}
							>
								<strong>Reminder:</strong> {stepLabel(item.step)}
							</Text>

							<Text
								style={{
									fontSize: "14px",
									color: "#6b7280",
									margin: "0",
								}}
							>
								{formatDaysUntil(item.daysUntilBirthday)}
							</Text>
						</Section>
					))}

					<Section
						style={{
							marginTop: "32px",
							paddingTop: "16px",
						}}
					>
						<Hr style={{ borderColor: "#e5e7eb", margin: "0 0 16px 0" }} />
						<Text
							style={{
								fontSize: "12px",
								color: "#6b7280",
								margin: "0",
							}}
						>
							This is an automated notification from your birthday tracker.
						</Text>
					</Section>
				</Container>
			</Body>
		</Html>
	);
}

export default BirthdayDigestEmail;
