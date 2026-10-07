import { HomeMusicDashboard } from "~/app/_components/home-music-dashboard";

// The middleware gates `/`, so only signed-in users reach this page.
export default function Home() {
	return <HomeMusicDashboard />;
}
