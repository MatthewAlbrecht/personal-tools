export function computeAppearsInForLater(
	item:
		| {
				isActive: boolean;
				markedAsSingle?: boolean;
				removedFromForLater?: boolean;
		  }
		| null
		| undefined,
): boolean {
	if (!item) {
		return false;
	}
	if (item.isActive !== true) {
		return false;
	}
	if (item.markedAsSingle === true) {
		return false;
	}
	if (item.removedFromForLater === true) {
		return false;
	}
	return true;
}
