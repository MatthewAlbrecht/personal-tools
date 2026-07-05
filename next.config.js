/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "i.scdn.co",
				pathname: "/image/**",
			},
			{
				protocol: "https",
				hostname: "image-cdn-ak.spotifycdn.com",
				pathname: "/image/**",
			},
			{
				protocol: "https",
				hostname: "image-cdn-fa.spotifycdn.com",
				pathname: "/image/**",
			},
		],
	},
};

export default config;
