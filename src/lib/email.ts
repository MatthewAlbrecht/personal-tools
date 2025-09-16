import { Resend } from 'resend';
import { env } from '~/env.js';

const resend = new Resend(env.RESEND_API_KEY);

interface NewRelease {
  id: number;
  name: string;
  sku: string;
  url: string;
  price?: number | null;
  image?: string | null;
}

interface SyncResult {
  syncedCount: number;
  totalIds: number;
  rangeExpanded?: boolean;
  newEndId?: number;
  newReleases?: NewRelease[];
}

export async function sendNewReleasesEmail(syncResult: SyncResult) {
  const newReleases = syncResult.newReleases || [];

  if (newReleases.length === 0) {
    console.log('📧 No new releases found, skipping email notification');
    return;
  }

  const formatPrice = (price?: number | null) => {
    if (!price) return 'N/A';
    return `$${price.toFixed(2)}`;
  };

  const releasesHtml = newReleases
    .map(
      (release) => `
    <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
      <h3 style="margin: 0 0 8px 0; color: #111827;">
        <a href="https://www.foliosociety.com/usa${release.url}" 
           style="color: #3b82f6; text-decoration: none;">
          ${release.name}
        </a>
      </h3>
      <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">
        <span><strong>ID:</strong>&nbsp;${release.id}</span>&nbsp;&nbsp;•&nbsp;&nbsp;<span><strong>SKU:</strong>&nbsp;${release.sku}</span>&nbsp;&nbsp;•&nbsp;&nbsp;<span><strong>Price:</strong>&nbsp;${formatPrice(release.price)}</span>
      </div>
      ${
        release.image
          ? `<img src="https://www.foliosociety.com/static/media/catalog${release.image}" 
                  alt="${release.name}" 
                  style="max-width: 200px; height: auto; border-radius: 4px;" />`
          : ''
      }
    </div>
  `
    )
    .join('');

  const emailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #111827; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">
        🏛️ New Folio Society Releases Discovered!
      </h1>
      
      <p style="font-size: 16px; color: #374151;">
        Great news! ${newReleases.length} new release${
          newReleases.length > 1 ? 's have' : ' has'
        } been found 
        during the latest sync.
      </p>

      <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <h2 style="margin: 0 0 16px 0; color: #111827;">Sync Summary</h2>
        <div style="font-size: 14px;">
          <span><strong>Total synced:</strong>&nbsp;${syncResult.syncedCount}</span>&nbsp;&nbsp;•&nbsp;&nbsp;<span><strong>New releases:</strong>&nbsp;${newReleases.length}</span>${
            syncResult.rangeExpanded
              ? `&nbsp;&nbsp;•&nbsp;&nbsp;<span style="color: #dc2626;"><strong>Range expanded to:</strong>&nbsp;${syncResult.newEndId}</span>`
              : ''
          }
        </div>
      </div>

      <h2 style="color: #111827; margin: 24px 0 16px 0;">New Releases</h2>
      ${releasesHtml}

      <div style="margin-top: 32px; padding: 16px; background-color: #eff6ff; border-radius: 8px;">
        <p style="margin: 0; font-size: 14px; color: #1e40af;">
          <a href="https://moooose.dev/folio-society" 
             style="color: #3b82f6; text-decoration: none; font-weight: bold;">
            → View all releases in your tracker
          </a>
        </p>
      </div>

      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
        <p style="margin: 0;">
          This is an automated notification from your Folio Society release tracker.
        </p>
      </div>
    </div>
  `;

  try {
    console.log(
      `📧 Sending email notification for ${newReleases.length} new releases...`
    );

    const result = await resend.emails.send({
      from: 'Folio Society Tracker <notifications@moooose.dev>',
      to: env.NOTIFICATION_EMAIL,
      subject: `🏛️ ${newReleases.length} New Folio Society Release${
        newReleases.length > 1 ? 's' : ''
      } Found!`,
      html: emailContent,
    });

    console.log('✅ Email sent successfully:', result.data?.id);
    return result;
  } catch (error) {
    console.error('❌ Failed to send email notification:', error);
    throw error;
  }
}
