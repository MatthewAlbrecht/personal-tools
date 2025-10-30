import {
	Body,
	Container,
	Head,
	Heading,
	Hr,
	Html,
	Img,
	Link,
	Section,
	Text,
} from "@react-email/components";
import * as React from "react";

interface NewRelease {
	id: number;
	name: string;
	sku: string;
	url: string;
	price?: number | null;
	image?: string | null;
}

interface SyncResult {
	syncedCount: number;
	totalIds: number;
	rangeExpanded?: boolean;
	newEndId?: number;
	newReleases?: NewRelease[];
}

interface FolioNotificationEmailProps {
	newReleases: NewRelease[];
	syncResult: SyncResult;
}

const formatPrice = (price?: number | null) => {
	if (!price) return "N/A";
	return `$${price.toFixed(2)}`;
};

export function FolioNotificationEmail({
	newReleases,
	syncResult,
}: FolioNotificationEmailProps) {
	return (
		<Html lang="en">
			<Head />
			<Body
				style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#ffffff" }}
			>
				<Container
					style={{ maxWidth: "600px", margin: "0 auto", padding: "20px" }}
				>
					{/* Header */}
					<Heading
						style={{
							color: "#111827",
							borderBottom: "2px solid #3b82f6",
							paddingBottom: "8px",
							marginBottom: "20px",
							fontSize: "28px",
							margin: "0 0 20px 0",
						}}
					>
						🏛️ New Folio Society Releases Discovered!
					</Heading>

					{/* Introduction */}
					<Text
						style={{ fontSize: "16px", color: "#374151", marginBottom: "20px" }}
					>
						Great news! {newReleases.length} new release
						{newReleases.length > 1 ? "s have" : " has"} been found during the
						latest sync.
					</Text>

					{/* Sync Summary */}
					<Section
						style={{
							backgroundColor: "#f3f4f6",
							padding: "16px",
							borderRadius: "8px",
							marginBottom: "24px",
						}}
					>
						<Heading
							as="h2"
							style={{
								margin: "0 0 16px 0",
								color: "#111827",
								fontSize: "20px",
							}}
						>
							Sync Summary
						</Heading>
						<Text style={{ fontSize: "14px", margin: "0" }}>
							<strong>Total synced:</strong> {syncResult.syncedCount} •{" "}
							<strong>New releases:</strong> {newReleases.length}
							{syncResult.rangeExpanded && (
								<span style={{ color: "#dc2626" }}>
									{" "}
									• <strong>Range expanded to:</strong> {syncResult.newEndId}
								</span>
							)}
						</Text>
					</Section>

					{/* New Releases Header */}
					<Heading
						as="h2"
						style={{
							color: "#111827",
							margin: "24px 0 16px 0",
							fontSize: "24px",
						}}
					>
						New Releases
					</Heading>

					{/* Individual Releases */}
					{newReleases.map((release) => (
						<Section
							key={release.id}
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
								<Link
									href={`https://www.foliosociety.com/usa${release.url}`}
									style={{ color: "#3b82f6", textDecoration: "none" }}
								>
									{release.name}
								</Link>
							</Heading>

							<Text
								style={{
									fontSize: "14px",
									color: "#6b7280",
									margin: "0 0 8px 0",
								}}
							>
								<strong>ID:</strong> {release.id} • <strong>SKU:</strong>{" "}
								{release.sku} • <strong>Price:</strong>{" "}
								{formatPrice(release.price)}
							</Text>

							{release.image && (
								<Img
									src={`https://www.foliosociety.com/static/media/catalog${release.image}`}
									alt={release.name}
									style={{
										maxWidth: "200px",
										height: "auto",
										borderRadius: "4px",
										display: "block",
									}}
								/>
							)}
						</Section>
					))}

					{/* CTA Section */}
					<Section
						style={{
							marginTop: "32px",
							padding: "16px",
							backgroundColor: "#eff6ff",
							borderRadius: "8px",
						}}
					>
						<Text
							style={{
								margin: "0",
								fontSize: "14px",
								color: "#1e40af",
							}}
						>
							<Link
								href="https://moooose.dev/folio-society"
								style={{
									color: "#3b82f6",
									textDecoration: "none",
									fontWeight: "bold",
								}}
							>
								→ View all releases in your tracker
							</Link>
						</Text>
					</Section>

					{/* Footer */}
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
							This is an automated notification from your Folio Society release
							tracker.
						</Text>
					</Section>
				</Container>
			</Body>
		</Html>
	);
}

export default FolioNotificationEmail;
