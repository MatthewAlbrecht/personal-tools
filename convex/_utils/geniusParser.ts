/**
 * Utilities for parsing Genius.com HTML pages
 */

/**
 * Extract lyrics from Genius song HTML
 * Handles multiple Lyrics__Container elements with proper formatting
 */
export function extractLyrics(html: string): string {
  const lyrics: string[] = [];

  // Find all Lyrics__Container elements (class names have dynamic hashes)
  const containerRegex = /data-lyrics-container="true"[^>]*>(.*?)<\/div>/gs;
  const matches = html.matchAll(containerRegex);

  for (const match of matches) {
    const containerHtml = match[1];
    if (!containerHtml || containerHtml.trim() === '') continue;

    // Process the container HTML to extract lyrics
    const processed = processLyricsHtml(containerHtml);
    if (processed.trim()) {
      lyrics.push(processed);
    }
  }

  // Join sections with blank line between containers
  return lyrics.join('\n\n').trim();
}

/**
 * Process lyrics HTML to preserve formatting
 */
function processLyricsHtml(html: string): string {
  let text = html;

  // Handle line breaks - convert <br> and <br/> and <br /> to newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Handle italics - wrap with asterisks
  text = text.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

  // Handle bold (sometimes used for ad-libs)
  text = text.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');

  // Remove annotation links but keep the text
  text = text.replace(
    /<a[^>]*data-ignore-on-click-outside[^>]*>(.*?)<\/a>/gi,
    '$1'
  );
  text = text.replace(/<a[^>]*href="[^"]*"[^>]*>(.*?)<\/a>/gi, '$1');

  // Remove span tags used for highlighting but keep content
  text = text.replace(
    /<span[^>]*class="[^"]*Highlight[^"]*"[^>]*>(.*?)<\/span>/gi,
    '$1'
  );
  text = text.replace(/<span[^>]*>(.*?)<\/span>/gi, '$1');

  // Remove hidden elements (used for spacing/UI)
  text = text.replace(
    /<span[^>]*style="[^"]*opacity:\s*0[^"]*"[^>]*>.*?<\/span>/gi,
    ''
  );

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = decodeHtmlEntities(text);

  // Clean up excessive whitespace but preserve intentional line breaks
  const lines = text.split('\n');
  const cleanedLines = lines.map((line) => line.trim());

  return cleanedLines.join('\n').trim();
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&#8217;': "'",
    '&#8216;': "'",
    '&#8220;': '"',
    '&#8221;': '"',
    '&#8211;': '–',
    '&#8212;': '—',
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }

  return decoded;
}

/**
 * Extract "About" section from Genius song HTML
 */
export function extractAbout(html: string): string | undefined {
  // Look for About__Container or SongDescription content
  const aboutRegex =
    /<div[^>]*class="[^"]*SongDescription__Content[^"]*"[^>]*>(.*?)<\/div>/s;
  const match = html.match(aboutRegex);

  if (!match) return undefined;

  let aboutText = match[1];

  if (!aboutText) return undefined;

  // Convert paragraph tags to double line breaks
  aboutText = aboutText.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');
  aboutText = aboutText.replace(/<p[^>]*>/gi, '');
  aboutText = aboutText.replace(/<\/p>/gi, '\n\n');

  // Remove links but keep text
  aboutText = aboutText.replace(/<a[^>]*>(.*?)<\/a>/gi, '$1');

  // Remove all HTML tags
  aboutText = aboutText.replace(/<[^>]+>/g, '');

  // Decode entities
  aboutText = decodeHtmlEntities(aboutText);

  // Clean up whitespace
  aboutText = aboutText.trim().replace(/\n{3,}/g, '\n\n');

  return aboutText || undefined;
}

/**
 * Extract album tracklist URLs from Genius album page
 */
export function extractAlbumTracklist(html: string): string[] {
  const urls: string[] = [];

  // Look for AlbumTracklist__Container section
  const tracklistRegex =
    /<ol[^>]*class="[^"]*AlbumTracklist__Container[^"]*"[^>]*>(.*?)<\/ol>/s;
  const tracklistMatch = html.match(tracklistRegex);

  if (!tracklistMatch) return urls;

  const tracklistHtml = tracklistMatch[1];

  // Extract all song URLs from the tracklist
  const linkRegex =
    /<a[^>]*href="(https:\/\/genius\.com\/[^"]*-lyrics)"[^>]*>/g;
  const linkMatches = tracklistHtml?.matchAll(linkRegex);

  if (linkMatches) {
    for (const match of linkMatches) {
      if (match[1]) {
        urls.push(match[1]);
      }
    }
  }

  return urls;
}

/**
 * Extract album metadata from song page
 */
export function extractAlbumMetadata(html: string): {
  albumTitle: string;
  artistName: string;
  albumUrl: string;
} | null {
  // Extract album title from PrimaryAlbum__Title
  const albumTitleRegex =
    /<a[^>]*class="[^"]*PrimaryAlbum__Title[^"]*"[^>]*>(.*?)<\/a>/s;
  const albumMatch = html.match(albumTitleRegex);

  if (!albumMatch) return null;

  let albumTitle = albumMatch[1] || '';

  // Clean up album title (remove HTML entities and extra whitespace)
  albumTitle = albumTitle.replace(/<[^>]+>/g, '').trim();
  albumTitle = decodeHtmlEntities(albumTitle);

  // Extract album URL
  const albumUrlRegex =
    /<a[^>]*class="[^"]*PrimaryAlbum__Title[^"]*"[^>]*href="([^"]+)"/;
  const urlMatch = html.match(albumUrlRegex);
  const albumUrl = urlMatch ? urlMatch[1] : '';

  // Extract artist name from primary artist
  const artistRegex =
    /<h2[^>]*class="[^"]*SongHeader[^"]*Title[^"]*"[^>]*>.*?<div[^>]*class="[^"]*HoverMarquee[^"]*"[^>]*>.*?<span[^>]*>(.*?)<\/span>/s;
  const artistMatch = html.match(artistRegex);

  let artistName = '';
  if (artistMatch?.[1]) {
    artistName = artistMatch[1].replace(/<[^>]+>/g, '').trim();
    artistName = decodeHtmlEntities(artistName);
  }

  // Fallback: try to get artist from SongHeader credit list
  if (!artistName) {
    const fallbackArtistRegex =
      /<div[^>]*class="[^"]*SongHeader[^"]*CreditList[^"]*"[^>]*>.*?<a[^>]*>(.*?)<\/a>/s;
    const fallbackMatch = html.match(fallbackArtistRegex);
    if (fallbackMatch?.[1]) {
      artistName = fallbackMatch[1].replace(/<[^>]+>/g, '').trim();
      artistName = decodeHtmlEntities(artistName);
    }
  }

  if (!albumTitle || !artistName) return null;

  return {
    albumTitle,
    artistName,
    albumUrl: albumUrl?.startsWith('http')
      ? albumUrl
      : `https://genius.com${albumUrl || ''}`,
  };
}

/**
 * Extract song title from song page
 */
export function extractSongTitle(html: string): string {
  // Look for the song title in the header
  const titleRegex =
    /<h1[^>]*class="[^"]*SongHeader[^"]*Title[^"]*"[^>]*>.*?<span[^>]*>(.*?)<\/span>/s;
  const match = html.match(titleRegex);

  if (!match || !match[1]) return '';

  let title = match[1].replace(/<[^>]+>/g, '').trim();
  title = decodeHtmlEntities(title);

  return title;
}

/**
 * Generate URL-safe slug from text
 */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      // biome-ignore lint/suspicious/noMisleadingCharacterClass: Unicode range is valid for removing diacritics
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .trim()
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-')
  ); // Remove consecutive hyphens
}
