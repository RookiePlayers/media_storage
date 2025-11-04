import { assertHasIntegrity } from '../src/utils/validate';

describe('Integrity contract', () => {
  it('throws when integrity missing', () => {
    expect(() => assertHasIntegrity({} as any)).toThrow(/missing valid integrity/i);
  });

  it('accepts valid SRI', () => {
    const ok = assertHasIntegrity({
      url: 'u',
      downloadUrl: 'u',
      key: 'k',
      integrity: 'sha256-AAAA',
    } as any);
    expect(ok.integrity).toBe('sha256-AAAA');
  });

  it('rejects invalid SRI', () => {
    expect(() =>
      assertHasIntegrity({ url: 'u', downloadUrl: 'u', key: 'k', integrity: 'md6-bad' } as any)
    ).toThrow();
  });
});