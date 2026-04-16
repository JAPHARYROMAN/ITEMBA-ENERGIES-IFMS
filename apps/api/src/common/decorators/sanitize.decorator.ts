import { Transform } from 'class-transformer';

/**
 * Strips HTML tags from string fields before validation.
 * Apply to free-text DTO properties (reason, notes, description).
 */
export function SanitizeHtml(): PropertyDecorator {
  return Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/<[^>]*>/g, '').trim() : value,
  );
}
