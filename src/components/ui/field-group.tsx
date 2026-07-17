import type * as React from "react";
import { cn } from "~/lib/utils";
import { Label } from "./label";

function FieldGroup({
	label,
	htmlFor,
	className,
	labelClassName,
	children,
}: {
	label: string;
	htmlFor?: string;
	className?: string;
	labelClassName?: string;
	children: React.ReactNode;
}) {
	return (
		<div className={cn("space-y-2", className)}>
			<Label htmlFor={htmlFor} className={labelClassName}>
				{label}
			</Label>
			{children}
		</div>
	);
}

export { FieldGroup };
