import { useEffect, useState } from "react";

export function useDebouncedState<T>(
	initialValue: T,
	delay: number,
): [T, T, (value: T) => void] {
	const [value, setValue] = useState<T>(initialValue);
	const [debouncedValue, setDebouncedValue] = useState<T>(initialValue);

	useEffect(() => {
		const handler = setTimeout(() => {
			setDebouncedValue(value);
		}, delay);

		return () => {
			clearTimeout(handler);
		};
	}, [value, delay]);

	return [value, debouncedValue, setValue];
}
