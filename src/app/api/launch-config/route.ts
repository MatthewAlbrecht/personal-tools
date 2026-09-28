import { NextResponse } from "next/server";
import { env } from "~/env.js";

export async function GET(): Promise<NextResponse> {
	return NextResponse.json({ convexUrl: env.NEXT_PUBLIC_CONVEX_URL });
}
