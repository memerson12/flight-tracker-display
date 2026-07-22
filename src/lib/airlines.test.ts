import { describe, expect, it } from 'vitest';

import { extractAirlineCode, getAirline, getLogoUrl, resolveAirlineCode } from './airlines';

describe('QantasLink airline mapping', () => {
  it('recognizes a QantasLink ICAO callsign without truncating it', () => {
    expect(extractAirlineCode('QLK829D')).toBe('QLK');
    expect(resolveAirlineCode('QLK', 'QF', 'QF829')).toBe('QLK');
    expect(getAirline('QLK')).toMatchObject({
      name: 'QantasLink',
      color: '#E30613',
      alliance: 'oneworld'
    });
  });

  it.each(['QLK', 'QJE', 'NWK'])('uses the Qantas logo for %s operations', (code) => {
    expect(getAirline(code).name).toBe('QantasLink');
    expect(getLogoUrl(code)).toBe('https://www.gstatic.com/flights/airline_logos/70px/QF.png');
  });

  it('preserves existing two-character airline mappings', () => {
    expect(extractAirlineCode('QF123')).toBe('QF');
    expect(getAirline('QF').name).toBe('Qantas');
  });
});
