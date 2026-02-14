import { describe, expect, it } from '@jest/globals';

import { violatesMakerChecker } from './governance.service';

describe('Governance maker-checker', () => {
  it('blocks requester from approving own request by default', () => {
    expect(violatesMakerChecker('approve', 'u1', 'u1', false)).toBe(true);
  });

  it('allows self-approval when policy explicitly allows it', () => {
    expect(violatesMakerChecker('approve', 'u1', 'u1', true)).toBe(false);
  });

  it('does not block reject action from requester', () => {
    expect(violatesMakerChecker('reject', 'u1', 'u1', false)).toBe(false);
  });
});
