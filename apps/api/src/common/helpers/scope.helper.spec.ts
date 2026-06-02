import { extractTenantScope, mergeTenantScope } from './scope.helper';

describe('scope helper', () => {
  const companyA = '11111111-1111-1111-1111-111111111111';
  const companyB = '22222222-2222-2222-2222-222222222222';
  const branchA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  it('extracts unique company and branch UUID scopes', () => {
    const scope = extractTenantScope([
      `company:${companyA}`,
      `company:${companyA}`,
      'company:not-a-uuid',
      `branch:${branchA}`,
      'reports:read',
    ]);

    expect(scope).toEqual({
      companyIds: [companyA],
      branchIds: [branchA],
    });
  });

  it('merges JWT and trusted server scope context', () => {
    const scope = mergeTenantScope({
      permissions: [`company:${companyA}`],
      companyIds: [companyB],
      branchId: branchA,
    });

    expect(scope.companyIds).toEqual([companyA, companyB]);
    expect(scope.branchIds).toEqual([branchA]);
  });
});
