import { ConvexError } from 'convex/values';
import type { ActionCtx, MutationCtx, QueryCtx } from './_generated/server';

// Auth utility functions for Convex
export function requireAuth(ctx: QueryCtx | MutationCtx | ActionCtx) {
  // Auth is handled by Next.js middleware via session cookies
  // This function is a no-op that just returns true to indicate auth is handled
  return true;
}

// For custom auth, we can validate session tokens passed as headers
export function validateSessionToken(token: string) {
  if (!token) {
    return null;
  }

  try {
    // Decode the token (assuming it's base64url encoded)
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts = decoded.split(':');
    const username = parts[0];
    const timestamp = parts[1];

    if (!username || !timestamp) {
      return null;
    }

    // Check if token is recent (within 7 days)
    const tokenTime = Number.parseInt(timestamp, 10);
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    if (now - tokenTime > sevenDays) {
      return null;
    }

    return { username };
  } catch (error) {
    return null;
  }
}
