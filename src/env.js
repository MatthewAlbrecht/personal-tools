import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	/**
	 * Specify your server-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars.
	 */
	server: {
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
		AUTH_USERNAME: z.string().min(1),
		AUTH_PASSWORD: z.string().min(1),
		SESSION_SECRET: z.string().min(16),
		CRON_SECRET: z.string().min(16),
		RESEND_API_KEY: z.string().min(1),
		NOTIFICATION_EMAIL: z.string().email(),
		// Optional: Only needed if using S3/CloudFront for file storage
		AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
		AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
		AWS_REGION: z.string().default("us-east-1"),
		S3_BUCKET_NAME: z.string().min(1).optional(),
		CLOUDFRONT_DOMAIN: z.string().min(1).optional(),
	},

	/**
	 * Specify your client-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars. To expose them to the client, prefix them with
	 * `NEXT_PUBLIC_`.
	 */
	client: {
		NEXT_PUBLIC_CONVEX_URL: z.string().url(),
		NEXT_PUBLIC_CONVEX_PROD_URL: z.string().url().optional(),
	},

	/**
	 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
	 * middlewares) or client-side so we need to destruct manually.
	 */
	runtimeEnv: {
		NODE_ENV: process.env.NODE_ENV,
		AUTH_USERNAME: process.env.AUTH_USERNAME,
		AUTH_PASSWORD: process.env.AUTH_PASSWORD,
		SESSION_SECRET: process.env.SESSION_SECRET,
		CRON_SECRET: process.env.CRON_SECRET,
		RESEND_API_KEY: process.env.RESEND_API_KEY,
		NOTIFICATION_EMAIL: process.env.NOTIFICATION_EMAIL,
		NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
		NEXT_PUBLIC_CONVEX_PROD_URL: process.env.NEXT_PUBLIC_CONVEX_PROD_URL,
		AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
		AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
		AWS_REGION: process.env.AWS_REGION,
		S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
		CLOUDFRONT_DOMAIN: process.env.CLOUDFRONT_DOMAIN,
	},
	/**
	 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
	 * useful for Docker builds.
	 */
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	/**
	 * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
	 * `SOME_VAR=''` will throw an error.
	 */
	emptyStringAsUndefined: true,
});
