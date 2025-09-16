import { Resend } from 'resend';
import { render } from '@react-email/components';
import { FolioNotificationEmail } from './emails/folio-notification';
import { env } from '~/env.js';

const resend = new Resend(env.RESEND_API_KEY);

// Import types from the React Email component
type NewRelease = {
  id: number;
  name: string;
  sku: string;
  url: string;
  price?: number | null;
  image?: string | null;
};

type SyncResult = {
  syncedCount: number;
  totalIds: number;
  rangeExpanded?: boolean;
  newEndId?: number;
  newReleases?: NewRelease[];
};

export async function sendNewReleasesEmail(syncResult: SyncResult) {
  const newReleases = syncResult.newReleases || [];

  if (newReleases.length === 0) {
    console.log('📧 No new releases found, skipping email notification');
    return;
  }

  try {
    console.log(
      `📧 Sending email notification for ${newReleases.length} new releases...`
    );

    const result = await resend.emails.send({
      from: 'Folio Society Tracker <notifications@moooose.dev>',
      to: env.NOTIFICATION_EMAIL,
      subject: `🏛️ ${newReleases.length} New Folio Society Release${newReleases.length > 1 ? 's' : ''
        } Found!`,
      react: <FolioNotificationEmail newReleases={newReleases} syncResult={syncResult} />,
    });

    console.log('✅ Email sent successfully:', result.data?.id);
    return result;
  } catch (error) {
    console.error('❌ Failed to send email notification:', error);
    throw error;
  }
}
