import { describe, expect, it } from 'vitest';

import {
  extractAirlineCode,
  getAirline,
  getLogoUrl,
  resolveAirlineCode,
  resolveFlightAirlineCode
} from './airlines';

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

describe('ICAO airline code mapping', () => {
  it.each([
    ['SWA3617', 'WN', 'Southwest Airlines', 'WN'],
    ['DAL829', 'DL', 'Delta Air Lines', 'DL']
  ])('maps %s to its commercial airline identity', (identifier, expectedCode, expectedName, expectedLogoCode) => {
    const code = extractAirlineCode(identifier);

    expect(code).toBe(expectedCode);
    expect(getAirline(code).name).toBe(expectedName);
    expect(getLogoUrl(code)).toBe(`https://www.gstatic.com/flights/airline_logos/70px/${expectedLogoCode}.png`);
  });

  it('prefers a recognized ICAO operator over a misleading two-letter prefix', () => {
    expect(resolveAirlineCode('DAL', 'DAL1234', 'DL1234')).toBe('DL');
    expect(resolveAirlineCode('SWA', 'WN3617', 'SWA3617')).toBe('WN');
  });

  it.each([
    ['AAL100', 'AA'],
    ['UAL200', 'UA'],
    ['JBU300', 'B6'],
    ['ASA400', 'AS'],
    ['FFT500', 'F9'],
    ['NKS600', 'NK']
  ])('maps common US operator %s to %s', (identifier, expectedCode) => {
    expect(extractAirlineCode(identifier)).toBe(expectedCode);
  });

  it('canonicalizes a raw ICAO code passed directly to airline and logo lookup', () => {
    expect(getAirline('DAL').name).toBe('Delta Air Lines');
    expect(getLogoUrl('SWA')).toBe('https://www.gstatic.com/flights/airline_logos/70px/WN.png');
  });

  it('uses the marketing carrier for a regional codeshare while preserving operator-brand overrides', () => {
    expect(resolveFlightAirlineCode({
      icao: 'SKW',
      iata: 'DL',
      flightNumber: 'DL3857',
      callsign: 'SKW3857'
    })).toBe('DL');
    expect(resolveFlightAirlineCode({
      icao: 'QLK',
      iata: 'QF',
      flightNumber: 'QF829',
      callsign: 'QLK829D'
    })).toBe('QLK');
  });

  it('does not truncate an unknown ICAO operator into a fake airline', () => {
    expect(extractAirlineCode('XYZ123')).toBe('');
    expect(resolveAirlineCode('XYZ', 'XYZ123')).toBe('');
    expect(getAirline('XYZ').name).toBe('Unknown Airline');
    expect(getLogoUrl('XYZ')).toBeNull();
  });

  it.each([
    ['UAE123', 'EK'],
    ['DLH456', 'LH'],
    ['QTR789', 'QR']
  ])('does not confuse %s with its two-letter prefix', (identifier, expectedCode) => {
    expect(extractAirlineCode(identifier)).toBe(expectedCode);
  });
});

describe('Link Airways flight identifier overrides', () => {
  it('maps the non-standard LR identifier to Link Airways globally', () => {
    expect(extractAirlineCode('LR442')).toBe('FC');
    expect(resolveFlightAirlineCode({ flightNumber: 'LR442', callsign: 'LR442' })).toBe('FC');
    expect(getAirline('LR')).toMatchObject({
      name: 'Link Airways',
      color: '#1775BC'
    });
    expect(getLogoUrl('LR')).toBe('https://www.gstatic.com/flights/airline_logos/70px/FC.png');
  });
});
