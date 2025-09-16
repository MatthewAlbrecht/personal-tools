/**
 * Utility functions for formatting data display
 */

/**
 * Formats a price value for display
 * @param price - The price value (can be null/undefined)
 * @returns Formatted price string or "N/A" if no price
 */
export function formatPrice(price?: number | null): string {
  if (!price) return 'N/A';
  return `$${price.toFixed(2)}`;
}

/**
 * Formats a date for display in a consistent format
 * @param date - Date value (can be Date, number timestamp, or ISO string)
 * @returns Formatted date string
 */
export function formatDate(date: Date | number | string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}
