import { ConvexError } from 'convex/values';
import type { QueryCtx, MutationCtx, ActionCtx } from './_generated/server';

// Auth utility functions for Convex
export function requireAuth(ctx: QueryCtx | MutationCtx | ActionCtx) {
  // For now, we'll check if the user identity exists
  // In Convex, authenticated users will have an identity
  const identity = ctx.auth.getUserIdentity();

  if (!identity) {
    throw new ConvexError('Unauthorized: No user identity found');
  }

  return identity;
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
