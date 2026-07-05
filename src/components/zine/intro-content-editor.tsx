"use client";

import { Bold, Italic } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useRef } from "react";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

export function IntroContentEditor({
	id,
	value,
	onChange,
	onBlur,
	disabled = false,
	label = "Zine intro page",
	placeholder = "Notes for the page after the cover. Use **bold**, *italic*, and blank lines for paragraphs.",
	helperText = "Appears after the cover in the album zine. Blank lines start new paragraphs.",
	textareaClassName,
}: {
	id: string;
	value: string;
	onChange: (value: string) => void;
	onBlur?: () => void;
	disabled?: boolean;
	label?: string;
	placeholder?: string;
	helperText?: string;
	textareaClassName?: string;
}) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	function wrapSelection(before: string, after: string) {
		const textarea = textareaRef.current;
		if (!textarea || disabled) {
			return;
		}

		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const selected = value.slice(start, end);
		const nextValue =
			value.slice(0, start) + before + selected + after + value.slice(end);
		onChange(nextValue);

		const cursorStart = start + before.length;
		const cursorEnd = cursorStart + selected.length;
		window.requestAnimationFrame(() => {
			textarea.focus();
			textarea.setSelectionRange(cursorStart, cursorEnd);
		});
	}

	function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (disabled) {
			return;
		}

		const modifier = event.metaKey || event.ctrlKey;
		if (!modifier) {
			return;
		}

		if (event.key === "b" || event.key === "B") {
			event.preventDefault();
			wrapSelection("**", "**");
			return;
		}

		if (event.key === "i" || event.key === "I") {
			event.preventDefault();
			wrapSelection("*", "*");
		}
	}

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-2">
				<Label htmlFor={id}>{label}</Label>
				<div className="flex gap-1">
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-8 px-2"
						disabled={disabled}
						onClick={() => wrapSelection("**", "**")}
					>
						<Bold className="h-4 w-4" />
						<span className="sr-only">Bold</span>
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-8 px-2"
						disabled={disabled}
						onClick={() => wrapSelection("*", "*")}
					>
						<Italic className="h-4 w-4" />
						<span className="sr-only">Italic</span>
					</Button>
				</div>
			</div>
			<Textarea
				ref={textareaRef}
				id={id}
				className={textareaClassName ?? "min-h-36 font-mono text-sm"}
				value={value}
				disabled={disabled}
				onChange={(event) => onChange(event.target.value)}
				onBlur={onBlur}
				onKeyDown={handleKeyDown}
				placeholder={placeholder}
			/>
			<p className="text-muted-foreground text-xs">{helperText}</p>
		</div>
	);
}
