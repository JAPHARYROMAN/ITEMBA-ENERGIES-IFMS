import { describe, test, expect } from 'vitest';
import i18n from './i18n';

describe('i18n configuration', () => {
  test('initializes with English as language and fallback', () => {
    expect(i18n.language).toBe('en');
    expect(i18n.options.fallbackLng).toContain('en');
  });

  test('exposes the en translation bundle', () => {
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);
  });

  test('resolves known keys from the common namespace', () => {
    expect(i18n.t('common.save')).toBe('Save');
    expect(i18n.t('common.cancel')).toBe('Cancel');
    expect(i18n.t('common.export')).toBe('Export');
  });

  test('returns the key itself for unknown lookups', () => {
    expect(i18n.t('common.__definitely_missing__')).toBe(
      'common.__definitely_missing__',
    );
  });

  test('does not escape interpolated values (escapeValue is false)', () => {
    const out = i18n.t('common.save', { defaultValue: '<b>{{x}}</b>', x: 'A&B' });
    expect(out).toBe('Save');
    expect(i18n.t('__raw__', { defaultValue: '{{v}}', v: 'a & b' })).toBe('a & b');
  });
});
