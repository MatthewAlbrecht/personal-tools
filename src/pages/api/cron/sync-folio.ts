import type { NextApiRequest, NextApiResponse } from 'next';
import { appRouter } from '~/server/api/root';
import { createTRPCContext } from '~/server/api/trpc';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify this is a legitimate cron request
  const authHeader = req.headers.authorization;
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expectedAuth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🔄 Starting scheduled Folio Society sync...');

    // Create TRPC context and caller
    const ctx = await createTRPCContext({ req, res });
    const caller = appRouter.createCaller(ctx);

    // Perform the sync
    const result = await caller.folioSociety.syncReleases({});

    console.log('✅ Sync completed:', result);

    res.status(200).json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Cron sync failed:', error);

    res.status(500).json({
      error: 'Sync failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}
