import { describe, expect, it } from 'vitest';
import {
  formatBasemapValidity,
  getBasemapLatestValidYear,
  getBasemapValidityPeriod,
  getBasemapValidYears,
  isBasemapValidForYear
} from './basemap-validity.utils';

const singleYear = { date: '2026' };
const regions = { date: '2025', valid_from: 2017, valid_to: 2026 };

describe('basemap validity period', () => {
  it('falls back to the date when no period is declared', () => {
    expect(getBasemapValidityPeriod(singleYear)).toEqual({
      from: 2026,
      to: 2026
    });
    expect(formatBasemapValidity(singleYear)).toBe('2026');
    expect(getBasemapValidYears(singleYear)).toEqual(['2026']);
  });

  it('formats a multi-year period with an en dash', () => {
    expect(formatBasemapValidity(regions)).toBe('2017–2026');
  });

  it('shows the plain date when the period is a single year', () => {
    expect(
      formatBasemapValidity({ date: '2024', valid_from: 2024, valid_to: 2024 })
    ).toBe('2024');
  });

  it('lists every year of the period', () => {
    expect(
      getBasemapValidYears({ date: '2025', valid_from: 2023, valid_to: 2026 })
    ).toEqual(['2023', '2024', '2025', '2026']);
  });

  it('matches any year inside the period', () => {
    expect(isBasemapValidForYear(regions, '2017')).toBe(true);
    expect(isBasemapValidForYear(regions, '2021')).toBe(true);
    expect(isBasemapValidForYear(regions, '2026')).toBe(true);
    expect(isBasemapValidForYear(regions, '2016')).toBe(false);
    expect(isBasemapValidForYear(singleYear, '2026')).toBe(true);
    expect(isBasemapValidForYear(singleYear, '2025')).toBe(false);
  });

  it('uses the end of the period as the latest valid year', () => {
    expect(getBasemapLatestValidYear(regions)).toBe(2026);
    expect(getBasemapLatestValidYear(singleYear)).toBe(2026);
  });

  it('tolerates a non-numeric date', () => {
    expect(getBasemapValidityPeriod({ date: 'n.d.' })).toBeNull();
    expect(formatBasemapValidity({ date: 'n.d.' })).toBe('n.d.');
    expect(isBasemapValidForYear({ date: 'n.d.' }, 'n.d.')).toBe(true);
  });
});
