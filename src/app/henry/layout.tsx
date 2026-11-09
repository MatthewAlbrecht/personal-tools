import type { Metadata } from "next";
import type * as React from "react";

export const metadata: Metadata = {
	title: "The Henry · moooose",
	description: "Every unit on the market at The Henry, checked hourly.",
};

export default function HenryLayout({
	children,
}: {
	children: React.ReactNode;
}): React.ReactElement {
	return <div className="px-4 py-6 md:px-6 md:py-8">{children}</div>;
}
