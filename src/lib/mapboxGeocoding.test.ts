import { describe, expect, it } from 'vitest';

import { buildMapboxGeocodingUrl } from './mapboxGeocoding';

describe('buildMapboxGeocodingUrl', () => {
  it('builds a global autocomplete query without forcing an Australian result', () => {
    const url = new URL(buildMapboxGeocodingUrl({
      query: '591 Spruce St, Half Moon Bay, CA 94019',
      accessToken: 'test-token'
    }));

    expect(decodeURIComponent(url.pathname)).toContain('591 Spruce St, Half Moon Bay, CA 94019.json');
    expect(url.searchParams.get('access_token')).toBe('test-token');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('autocomplete')).toBe('true');
    expect(url.searchParams.get('types')).toBe('address,place,postcode');
    expect(url.searchParams.has('country')).toBe(false);
  });

  it('supports a single-result lookup', () => {
    const url = new URL(buildMapboxGeocodingUrl({
      query: 'Brisbane Airport',
      accessToken: 'test-token',
      limit: 1,
      autocomplete: false
    }));

    expect(url.searchParams.get('limit')).toBe('1');
    expect(url.searchParams.get('autocomplete')).toBe('false');
  });
});
