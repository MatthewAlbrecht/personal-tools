"use client";

import { useCallback, useState } from "react";

export function useForLaterRecommendationDrawer() {
	const [isRecommendationDrawerOpen, setRecommendationDrawerOpen] =
		useState(false);

	const openRecommendationDrawer = useCallback(() => {
		setRecommendationDrawerOpen(true);
	}, []);

	const closeRecommendationDrawer = useCallback(() => {
		setRecommendationDrawerOpen(false);
	}, []);

	return {
		isRecommendationDrawerOpen,
		openRecommendationDrawer,
		closeRecommendationDrawer,
		setRecommendationDrawerOpen,
	};
}
