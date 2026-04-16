/**
 * Strip HTML tags and trim whitespace from user input strings.
 * Used on free-text fields (reason, notes, descriptions) to prevent stored XSS.
 */
export function sanitizeText(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}
