"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { X } from "lucide-react";
import {
	type ComponentProps,
	type Dispatch,
	type KeyboardEvent,
	type MouseEventHandler,
	type ReactNode,
	type RefObject,
	type SetStateAction,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";

import { cn } from "~/lib/utils";

type ComboboxContextValue = {
	items: string[];
	getItemLabel: (item: string) => string;
	multiple: boolean;
	value: string[];
	onValueChange: (value: string[]) => void;
	open: boolean;
	setOpen: (open: boolean) => void;
	filter: string;
	setFilter: (filter: string) => void;
	filteredItems: string[];
	toggleItem: (key: string) => void;
	removeItem: (key: string) => void;
	listboxId: string;
	highlightedIndex: number;
	setHighlightedIndex: Dispatch<SetStateAction<number>>;
	inputRef: RefObject<HTMLInputElement | null>;
};

const ComboboxContext = createContext<ComboboxContextValue | null>(null);

function useComboboxContext(): ComboboxContextValue {
	const ctx = useContext(ComboboxContext);
	if (!ctx) {
		throw new Error("Combobox components must be used within Combobox");
	}
	return ctx;
}

export function Combobox({
	items,
	getItemLabel,
	multiple = false,
	value,
	onValueChange,
	children,
}: {
	items: string[];
	getItemLabel?: (item: string) => string;
	multiple?: boolean;
	value: string[];
	onValueChange: (value: string[]) => void;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const [filter, setFilter] = useState("");
	const [highlightedIndex, setHighlightedIndex] = useState(0);
	const listboxId = useId();
	const inputRef = useRef<HTMLInputElement | null>(null);

	const resolveLabel = useMemo(
		() => getItemLabel ?? ((item: string) => item),
		[getItemLabel],
	);

	const filteredItems = useMemo(() => {
		const q = filter.trim().toLowerCase();
		if (!q) {
			return items;
		}
		return items.filter((item) => {
			const label = resolveLabel(item).toLowerCase();
			return label.includes(q) || item.toLowerCase().includes(q);
		});
	}, [items, filter, resolveLabel]);

	useEffect(() => {
		setHighlightedIndex(0);
		void filter;
	}, [filter]);

	useEffect(() => {
		setHighlightedIndex((index) => {
			if (filteredItems.length === 0) {
				return 0;
			}
			return Math.min(index, filteredItems.length - 1);
		});
	}, [filteredItems.length]);

	const toggleItem = useCallback(
		(key: string) => {
			if (multiple) {
				const next = value.includes(key)
					? value.filter((k) => k !== key)
					: [...value, key];
				onValueChange([...new Set(next)].sort());
			} else {
				onValueChange(value.includes(key) ? [] : [key]);
				setOpen(false);
			}
			setFilter("");
		},
		[multiple, onValueChange, value],
	);

	const removeItem = useCallback(
		(key: string) => {
			onValueChange(value.filter((k) => k !== key).sort());
		},
		[onValueChange, value],
	);

	const ctx: ComboboxContextValue = {
		items,
		getItemLabel: resolveLabel,
		multiple,
		value,
		onValueChange,
		open,
		setOpen,
		filter,
		setFilter,
		filteredItems,
		toggleItem,
		removeItem,
		listboxId,
		highlightedIndex,
		setHighlightedIndex,
		inputRef,
	};

	return (
		<ComboboxContext.Provider value={ctx}>
			<PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
				{children}
			</PopoverPrimitive.Root>
		</ComboboxContext.Provider>
	);
}

export function ComboboxChips({
	className,
	children,
	...props
}: ComponentProps<"div">) {
	return (
		<div
			data-slot="combobox-chips"
			className={cn("flex w-full flex-wrap items-center gap-1", className)}
			{...props}
		>
			{children}
		</div>
	);
}

export function ComboboxValue({ children }: { children: ReactNode }) {
	return <>{children}</>;
}

export function ComboboxChip({
	value: itemValue,
	children,
	className,
}: {
	value: string;
	children: ReactNode;
	className?: string;
}) {
	const { removeItem } = useComboboxContext();

	return (
		<span
			data-slot="combobox-chip"
			className={cn(
				"inline-flex max-w-full items-center gap-0.5 rounded-md bg-secondary px-2 py-0.5 text-secondary-foreground text-sm",
				className,
			)}
		>
			<span className="min-w-0 truncate">{children}</span>
			<button
				type="button"
				aria-label={`Remove ${String(children)}`}
				className="rounded-sm p-0.5 text-muted-foreground hover:bg-background/60 hover:text-foreground"
				onClick={(event) => {
					event.preventDefault();
					event.stopPropagation();
					removeItem(itemValue);
				}}
			>
				<X className="size-3.5" />
			</button>
		</span>
	);
}

export function ComboboxChipsInput({
	placeholder,
	className,
	onKeyDown,
	...props
}: Omit<ComponentProps<"input">, "value" | "onChange">) {
	const {
		filter,
		setFilter,
		setOpen,
		open,
		filteredItems,
		toggleItem,
		highlightedIndex,
		setHighlightedIndex,
		inputRef,
		listboxId,
	} = useComboboxContext();

	function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
		onKeyDown?.(event);
		if (event.defaultPrevented) {
			return;
		}

		const len = filteredItems.length;

		if (event.key === "ArrowDown") {
			event.preventDefault();
			setOpen(true);
			if (len === 0) {
				return;
			}
			setHighlightedIndex((i) => (open ? (i + 1) % len : 0));
			return;
		}

		if (event.key === "ArrowUp") {
			event.preventDefault();
			setOpen(true);
			if (len === 0) {
				return;
			}
			setHighlightedIndex((i) => (open ? (i - 1 + len) % len : len - 1));
			return;
		}

		if (event.key === "Enter") {
			if (!open || len === 0) {
				return;
			}
			event.preventDefault();
			const item = filteredItems[highlightedIndex];
			if (item !== undefined) {
				toggleItem(item);
			}
			return;
		}

		if (event.key === "Tab" && len > 0 && open) {
			if (!event.shiftKey) {
				if (highlightedIndex < len - 1) {
					event.preventDefault();
					setHighlightedIndex((i) => Math.min(i + 1, len - 1));
				}
			} else if (highlightedIndex > 0) {
				event.preventDefault();
				setHighlightedIndex((i) => Math.max(i - 1, 0));
			}
		}
	}

	const activeDescendantId =
		open && filteredItems.length > 0
			? `${listboxId}-option-${highlightedIndex}`
			: undefined;

	return (
		<input
			{...props}
			ref={inputRef}
			data-slot="combobox-chips-input"
			type="text"
			role="combobox"
			aria-expanded={open}
			aria-controls={listboxId}
			aria-autocomplete="list"
			aria-activedescendant={activeDescendantId}
			value={filter}
			onChange={(event) => setFilter(event.target.value)}
			onFocus={() => setOpen(true)}
			placeholder={placeholder}
			className={cn(
				"min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground",
				className,
			)}
			onClick={(event) => event.stopPropagation()}
			onKeyDown={handleKeyDown}
		/>
	);
}

export function ComboboxTrigger({
	className,
	children,
	...props
}: ComponentProps<typeof PopoverPrimitive.Trigger>) {
	return (
		<PopoverPrimitive.Trigger asChild {...props}>
			<div
				data-slot="combobox-trigger"
				className={cn(
					"flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-left shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
					className,
				)}
			>
				{children}
			</div>
		</PopoverPrimitive.Trigger>
	);
}

export function ComboboxContent({
	className,
	children,
	align = "start",
	onOpenAutoFocus,
	...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
	const { inputRef } = useComboboxContext();

	return (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Content
				data-slot="combobox-content"
				align={align}
				sideOffset={4}
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					queueMicrotask(() => inputRef.current?.focus());
					onOpenAutoFocus?.(event);
				}}
				className={cn(
					"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-[var(--radix-popover-trigger-width)] origin-[var(--radix-popover-content-transform-origin)] rounded-md border bg-popover text-popover-foreground shadow-md outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
					className,
				)}
				{...props}
			>
				{children}
			</PopoverPrimitive.Content>
		</PopoverPrimitive.Portal>
	);
}

export function ComboboxInput({
	placeholder,
	className,
	...props
}: Omit<ComponentProps<"input">, "value" | "onChange">) {
	const { filter, setFilter } = useComboboxContext();
	return (
		<input
			data-slot="combobox-input"
			type="text"
			value={filter}
			onChange={(event) => setFilter(event.target.value)}
			placeholder={placeholder}
			className={cn(
				"flex h-9 w-full border-b bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export function ComboboxEmpty({
	className,
	children,
	...props
}: ComponentProps<"div">) {
	const { filteredItems } = useComboboxContext();
	if (filteredItems.length > 0) {
		return null;
	}
	return (
		<div
			data-slot="combobox-empty"
			className={cn(
				"px-3 py-6 text-center text-muted-foreground text-sm",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

export function ComboboxList({
	children,
	className,
}: {
	children: (item: string, index: number) => ReactNode;
	className?: string;
}) {
	const { filteredItems, listboxId } = useComboboxContext();
	if (filteredItems.length === 0) {
		return null;
	}
	return (
		<div
			id={listboxId}
			data-slot="combobox-list"
			className={cn("max-h-60 overflow-y-auto p-1", className)}
		>
			{filteredItems.map((item, index) => (
				<div key={item}>{children(item, index)}</div>
			))}
		</div>
	);
}

export function ComboboxItem({
	value: itemValue,
	className,
	children,
	id: idProp,
	onClick,
	onMouseEnter,
	...props
}: {
	value: string;
	children: ReactNode;
	id?: string;
	onClick?: MouseEventHandler<HTMLButtonElement>;
	onMouseEnter?: MouseEventHandler<HTMLButtonElement>;
} & Omit<
	ComponentProps<"button">,
	"value" | "type" | "onClick" | "onMouseEnter"
>) {
	const {
		toggleItem,
		value: selected,
		filteredItems,
		highlightedIndex,
		setHighlightedIndex,
		listboxId,
	} = useComboboxContext();
	const indexInFiltered = filteredItems.indexOf(itemValue);
	const isHighlighted =
		indexInFiltered >= 0 && indexInFiltered === highlightedIndex;
	const isSelected = selected.includes(itemValue);
	const optionId =
		idProp ??
		(indexInFiltered >= 0
			? `${listboxId}-option-${indexInFiltered}`
			: undefined);

	return (
		<button
			type="button"
			{...props}
			id={optionId}
			data-slot="combobox-item"
			aria-selected={isSelected}
			tabIndex={-1}
			className={cn(
				"relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				isSelected && "bg-accent/50",
				isHighlighted && "bg-accent text-accent-foreground",
				className,
			)}
			onClick={(event) => {
				onClick?.(event);
				if (event.defaultPrevented) {
					return;
				}
				toggleItem(itemValue);
			}}
			onMouseEnter={(event) => {
				onMouseEnter?.(event);
				if (indexInFiltered >= 0) {
					setHighlightedIndex(indexInFiltered);
				}
			}}
		>
			{children}
		</button>
	);
}
