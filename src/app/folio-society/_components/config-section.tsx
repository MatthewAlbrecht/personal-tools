import { Settings } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { InputGroup } from "~/components/ui/input-group";
import type { ConvexConfig } from "../_utils/types";

export function ConfigSection({
	config,
	isUpdatingConfig,
	startIdPlaceholder,
	endIdPlaceholder,
	formatDate,
	onUpdateConfig,
}: {
	config?: ConvexConfig | null;
	isUpdatingConfig: boolean;
	startIdPlaceholder: string;
	endIdPlaceholder: string;
	formatDate: (date: Date | number | string) => string;
	onUpdateConfig: (startId: number, endId: number) => Promise<void>;
}) {
	const [isConfigEditing, setIsConfigEditing] = useState(false);
	const [startIdInput, setStartIdInput] = useState("");
	const [endIdInput, setEndIdInput] = useState("");

	async function handleUpdateConfig() {
		const startId = Number.parseInt(startIdInput);
		const endId = Number.parseInt(endIdInput);

		if (Number.isNaN(startId) || Number.isNaN(endId)) {
			throw new Error("Please enter valid numbers for start and end IDs.");
		}

		if (startId >= endId) {
			throw new Error("Start ID must be less than end ID.");
		}

		await onUpdateConfig(startId, endId);
		setStartIdInput("");
		setEndIdInput("");
	}

	return (
		<Card className="mb-6">
			<CardHeader>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Settings className="h-5 w-5" />
						<CardTitle>Configuration</CardTitle>
					</div>
					<Button
						onClick={() => {
							setIsConfigEditing(!isConfigEditing);
						}}
						variant="outline"
						size="sm"
						className="cursor-pointer"
					>
						{isConfigEditing ? "Close" : "Edit"}
					</Button>
				</div>
			</CardHeader>
			{isConfigEditing && (
				<CardContent>
					{config && (
						<div className="mb-4 rounded-md bg-muted p-3">
							<div className="font-medium text-sm">Current Configuration:</div>
							<div className="mt-1 flex gap-4 text-muted-foreground text-sm">
								<span>
									Start ID:{" "}
									<span className="font-medium font-mono text-foreground">
										{config.startId}
									</span>
								</span>
								<span>
									End ID:{" "}
									<span className="font-medium font-mono text-foreground">
										{config.endId}
									</span>
								</span>
								<span>
									Range:{" "}
									<span className="font-medium font-mono text-foreground">
										{config.endId - config.startId + 1}
									</span>{" "}
									IDs
								</span>
							</div>
							<div className="mt-1 text-muted-foreground text-xs">
								Last updated: {formatDate(config.updatedAt)}
							</div>
						</div>
					)}
					<div className="flex items-end gap-4">
						<InputGroup label="Start ID" htmlFor="startId" className="flex-1">
							<Input
								id="startId"
								type="number"
								placeholder={startIdPlaceholder}
								value={startIdInput}
								onChange={(e) => setStartIdInput(e.target.value)}
							/>
						</InputGroup>
						<InputGroup label="End ID" htmlFor="endId" className="flex-1">
							<Input
								id="endId"
								type="number"
								placeholder={endIdPlaceholder}
								value={endIdInput}
								onChange={(e) => setEndIdInput(e.target.value)}
							/>
						</InputGroup>
						<Button
							onClick={handleUpdateConfig}
							disabled={isUpdatingConfig}
							variant="outline"
						>
							Update Range
						</Button>
					</div>
				</CardContent>
			)}
		</Card>
	);
}
