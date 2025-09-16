import type { NextApiRequest, NextApiResponse } from 'next';
import { appRouter } from '~/server/api/root';
import { createTRPCContext } from '~/server/api/trpc';
import { sendNewReleasesEmail } from '~/lib/email';

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
    const ctx = await createTRPCContext({
      headers: new Headers(req.headers as HeadersInit),
    });
    const caller = appRouter.createCaller(ctx);

    // Perform the sync
    console.log('🔄 Calling syncReleases mutation...');
    const result = await caller.folioSociety.syncReleases({});

    console.log('✅ Sync completed:', JSON.stringify(result, null, 2));
    console.log('📊 Sync details:');
    console.log(`   - Total IDs checked: ${result.totalIds}`);
    console.log(`   - Products synced: ${result.syncedCount}`);
    console.log(`   - New releases found: ${result.newReleasesCount}`);
    console.log(`   - Range expanded: ${result.rangeExpanded}`);
    if (result.newReleases && result.newReleases.length > 0) {
      console.log(
        '🆕 New releases:',
        result.newReleases.map((r) => `${r.name} (${r.sku})`)
      );
    }

    // Send email notification if new releases were found
    if (result.newReleasesCount > 0) {
      try {
        await sendNewReleasesEmail(result);
        console.log(
          `📧 Email notification sent for ${result.newReleasesCount} new releases`
        );
      } catch (emailError) {
        console.error('❌ Failed to send email notification:', emailError);
        // Don't fail the entire sync if email fails
      }
    }

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
