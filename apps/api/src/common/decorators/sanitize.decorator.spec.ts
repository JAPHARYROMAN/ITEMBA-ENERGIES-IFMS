import { plainToInstance } from 'class-transformer';
import { SanitizeHtml } from './sanitize.decorator';

class Sample {
  @SanitizeHtml()
  reason?: unknown;
}

function transform(value: unknown): unknown {
  return (plainToInstance(Sample, { reason: value }) as Sample).reason;
}

describe('SanitizeHtml', () => {
  it('strips HTML tags from a string and trims it', () => {
    expect(transform('  <b>hello</b> <i>world</i>  ')).toBe('hello world');
  });

  it('removes script-like tags entirely', () => {
    expect(transform('<script>alert(1)</script>safe')).toBe('alert(1)safe');
  });

  it('leaves a plain string (minus surrounding whitespace) intact', () => {
    expect(transform('  plain text  ')).toBe('plain text');
  });

  it('passes non-string values through untouched', () => {
    expect(transform(42)).toBe(42);
    expect(transform(undefined)).toBeUndefined();
    const obj = { a: 1 };
    expect(transform(obj)).toEqual(obj);
  });
});
