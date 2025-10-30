import { Search } from "lucide-react";
import { Input } from "~/components/ui/input";

export function SearchSection({
	searchInput,
	onSearchChange,
}: {
	searchInput: string;
	onSearchChange: (value: string) => void;
}) {
	return (
		<div className="relative mb-4 max-w-md">
			<Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
			<Input
				id="search"
				type="text"
				placeholder="Search by book name..."
				value={searchInput}
				onChange={(e) => onSearchChange(e.target.value)}
				className="pl-9"
			/>
		</div>
	);
}
