import { describe, expect, it } from 'vitest';
import {
  buildCalendarBreaks,
  buildEvenCalendarBreaks,
  CALENDAR_UNIT,
  chooseCalendarStep,
  countCalendarClasses,
  floorToCalendarStep,
  formatCalendarBoundary,
  formatCalendarClassLabel,
  inferCalendarGranularity,
  listCalendarStepOptions,
  parseCalendarBoundary,
  type CalendarStep
} from './calendar-breaks.utils';

const d = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const YEAR: CalendarStep = { unit: CALENDAR_UNIT.YEAR, count: 1 };
const QUARTER: CalendarStep = { unit: CALENDAR_UNIT.MONTH, count: 3 };
const WEEK: CalendarStep = { unit: CALENDAR_UNIT.WEEK, count: 1 };

describe('calendar breaks', () => {
  it('should align thresholds on calendar boundaries when the extent starts mid-period', () => {
    const result = buildCalendarBreaks(d('2020-03-15'), d('2023-08-01'), YEAR);
    expect(result.breaks.map(iso)).toEqual([
      '2021-01-01',
      '2022-01-01',
      '2023-01-01'
    ]);
    expect(iso(result.lower)).toBe('2020-01-01');
    expect(iso(result.upper)).toBe('2024-01-01');
  });

  it('should start quarters in January, April, July and October', () => {
    const result = buildCalendarBreaks(
      d('2021-02-10'),
      d('2021-11-30'),
      QUARTER
    );
    expect(result.breaks.map(iso)).toEqual([
      '2021-04-01',
      '2021-07-01',
      '2021-10-01'
    ]);
  });

  it('should start ISO weeks on Monday, across a year boundary', () => {
    expect(iso(floorToCalendarStep(d('2021-01-01'), WEEK))).toBe('2020-12-28');
    expect(iso(floorToCalendarStep(d('1969-12-31'), WEEK))).toBe('1969-12-29');
  });

  it('should align multi-year steps on multiples of the step, before 1970 and before year 100', () => {
    const decade: CalendarStep = { unit: CALENDAR_UNIT.YEAR, count: 10 };
    expect(iso(floorToCalendarStep(d('1957-06-01'), decade))).toBe(
      '1950-01-01'
    );
    const century: CalendarStep = { unit: CALENDAR_UNIT.YEAR, count: 100 };
    const early = new Date(0);
    early.setUTCFullYear(57, 5, 1);
    expect(
      new Date(floorToCalendarStep(early.getTime(), century)).getUTCFullYear()
    ).toBe(0);
  });

  it('should put a value equal to a threshold in the class that starts there', () => {
    const result = buildCalendarBreaks(d('2020-01-01'), d('2022-01-01'), YEAR);
    expect(result.breaks.map(iso)).toEqual(['2021-01-01', '2022-01-01']);
    expect(iso(result.upper)).toBe('2023-01-01');
  });

  it('should pick the finest step that gives at most the requested class count', () => {
    const step = chooseCalendarStep(d('1950-04-01'), d('2023-08-01'), 8);
    expect(step).toEqual({ unit: CALENDAR_UNIT.YEAR, count: 10 });
    expect(countCalendarClasses(d('1950-04-01'), d('2023-08-01'), step)).toBe(
      8
    );
  });

  it('should keep the same step when recomputed with the class count it produced', () => {
    const min = d('2019-11-20');
    const max = d('2021-05-03');
    const first = chooseCalendarStep(min, max, 7);
    const produced = countCalendarClasses(min, max, first);
    expect(chooseCalendarStep(min, max, produced)).toEqual(first);
  });

  it('should handle month lengths and leap years when stepping by month', () => {
    const result = buildCalendarBreaks(d('2024-01-31'), d('2024-04-15'), {
      unit: CALENDAR_UNIT.MONTH,
      count: 1
    });
    expect(result.breaks.map(iso)).toEqual([
      '2024-02-01',
      '2024-03-01',
      '2024-04-01'
    ]);
  });

  it('should offer only the steps that give between 2 and the maximum class count', () => {
    const options = listCalendarStepOptions(
      d('2020-01-15'),
      d('2022-06-01'),
      12
    );
    expect(options).toEqual([
      { unit: CALENDAR_UNIT.MONTH, count: 3 },
      { unit: CALENDAR_UNIT.MONTH, count: 6 },
      { unit: CALENDAR_UNIT.YEAR, count: 1 },
      { unit: CALENDAR_UNIT.YEAR, count: 2 }
    ]);

    const decades = listCalendarStepOptions(
      d('1953-05-13'),
      d('2023-09-06'),
      12
    );
    expect(decades.at(-1)).toEqual({ unit: CALENDAR_UNIT.YEAR, count: 50 });
  });

  it('should label classes with their inclusive end at the step granularity', () => {
    expect(
      formatCalendarClassLabel(
        d('1950-01-01'),
        d('1970-01-01'),
        {
          unit: CALENDAR_UNIT.YEAR,
          count: 20
        },
        'fr-FR'
      )
    ).toBe('1950–1969');
    expect(
      formatCalendarClassLabel(d('2021-01-01'), d('2022-01-01'), YEAR, 'fr-FR')
    ).toBe('2021');
    expect(
      formatCalendarClassLabel(
        d('2021-01-01'),
        d('2021-04-01'),
        QUARTER,
        'fr-FR'
      )
    ).toMatch(/^janv\.\s?–\s?mars 2021$/);
    expect(
      formatCalendarClassLabel(
        d('2021-03-01'),
        d('2021-04-01'),
        {
          unit: CALENDAR_UNIT.MONTH,
          count: 1
        },
        'en-US'
      )
    ).toBe('Mar 2021');
  });

  it('should read back every bound the panel shows when the user edits it', () => {
    const fr = 'fr-FR';
    for (const ms of [d('1975-01-01'), d('1975-04-01'), d('1975-04-12')]) {
      for (const step of [
        { unit: CALENDAR_UNIT.YEAR, count: 1 },
        { unit: CALENDAR_UNIT.MONTH, count: 1 },
        { unit: CALENDAR_UNIT.DAY, count: 1 }
      ] as CalendarStep[]) {
        expect(
          parseCalendarBoundary(formatCalendarBoundary(ms, step, fr), fr)
        ).toBe(ms);
        expect(
          parseCalendarBoundary(
            formatCalendarBoundary(ms, step, 'en-US'),
            'en-US'
          )
        ).toBe(ms);
      }
    }
  });

  it('should parse typed dates in the locale order and reject impossible ones', () => {
    expect(iso(parseCalendarBoundary('12/04/1975', 'fr-FR')!)).toBe(
      '1975-04-12'
    );
    expect(iso(parseCalendarBoundary('04/12/1975', 'en-US')!)).toBe(
      '1975-04-12'
    );
    expect(iso(parseCalendarBoundary('04/1975', 'fr-FR')!)).toBe('1975-04-01');
    expect(iso(parseCalendarBoundary('1975-4', 'fr-FR')!)).toBe('1975-04-01');
    expect(parseCalendarBoundary('30/02/1975', 'fr-FR')).toBeNull();
    expect(parseCalendarBoundary('bientôt', 'fr-FR')).toBeNull();
  });

  it('should infer the coarsest granularity the manual bounds share', () => {
    expect(
      inferCalendarGranularity([d('1975-01-01'), d('2000-01-01')]).unit
    ).toBe(CALENDAR_UNIT.YEAR);
    expect(
      inferCalendarGranularity([d('1975-01-01'), d('2000-07-01')]).unit
    ).toBe(CALENDAR_UNIT.MONTH);
    expect(
      inferCalendarGranularity([d('1975-01-01'), d('2000-07-14')]).unit
    ).toBe(CALENDAR_UNIT.DAY);
  });

  it('should label a multi-month manual class as a month range', () => {
    expect(
      formatCalendarClassLabel(
        d('2021-01-01'),
        d('2021-07-01'),
        {
          unit: CALENDAR_UNIT.MONTH,
          count: 1
        },
        'fr-FR'
      )
    ).toMatch(/^janv\.\s?–\s?juin 2021$/);
  });

  it('should spread manual date bounds evenly on year starts when the class count changes', () => {
    expect(
      buildEvenCalendarBreaks(d('1951-07-06'), d('2021-09-18'), 4).map(iso)
    ).toEqual(['1969-01-01', '1986-01-01', '2004-01-01']);
    expect(
      buildEvenCalendarBreaks(d('2021-01-04'), d('2021-06-27'), 3).map(iso)
    ).toEqual(['2021-03-01', '2021-04-01']);
  });
});
