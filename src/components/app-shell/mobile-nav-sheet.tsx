"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AppSidebar } from "~/components/app-shell/app-sidebar";
import { Button } from "~/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "~/components/ui/sheet";

export function MobileNavSheet() {
	const pathname = usePathname();
	const [open, setOpen] = useState(false);

	// Close the sheet after client-side navigations.
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the navigation signal
	useEffect(() => {
		setOpen(false);
	}, [pathname]);

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="md:hidden"
					aria-label="Open navigation"
				>
					<Menu className="size-4" />
				</Button>
			</SheetTrigger>
			<SheetContent side="left" className="w-[18rem] p-0">
				<SheetHeader className="border-b px-4 py-3 text-left">
					<SheetTitle className="font-[family-name:var(--font-display)] text-base">
						<Link href="/" onClick={() => setOpen(false)}>
							moooose
						</Link>
					</SheetTitle>
				</SheetHeader>
				<div className="h-[calc(100vh-3.5rem)] overflow-y-auto">
					<AppSidebar />
				</div>
			</SheetContent>
		</Sheet>
	);
}
