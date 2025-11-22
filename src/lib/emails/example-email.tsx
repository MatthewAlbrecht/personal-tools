import {
	Body,
	Container,
	Head,
	Heading,
	Hr,
	Html,
	Link,
	Section,
	Text,
} from "@react-email/components";
import * as React from "react";

type ExampleEmailProps = {
	userName: string;
	message: string;
};

/**
 * Example email template using React Email components
 * 
 * This is a basic template that demonstrates:
 * - Proper HTML email structure
 * - Inline styles for email compatibility
 * - Common email components (heading, text, links, etc.)
 */
export function ExampleEmail({ userName, message }: ExampleEmailProps) {
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
						👋 Hello {userName}!
					</Heading>

					{/* Main Content */}
					<Text
						style={{ fontSize: "16px", color: "#374151", marginBottom: "20px" }}
					>
						{message}
					</Text>

					{/* Info Section */}
					<Section
						style={{
							backgroundColor: "#f3f4f6",
							padding: "16px",
							borderRadius: "8px",
							marginBottom: "24px",
						}}
					>
						<Text style={{ fontSize: "14px", margin: "0", color: "#374151" }}>
							This is an example email template built with React Email. You can
							customize this to fit your needs.
						</Text>
					</Section>

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
								href="https://yourapp.com"
								style={{
									color: "#3b82f6",
									textDecoration: "none",
									fontWeight: "bold",
								}}
							>
								→ Visit your app
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
							This is an automated notification from your app.
						</Text>
					</Section>
				</Container>
			</Body>
		</Html>
	);
}

export default ExampleEmail;
