import {
  ClassificationMethod,
  type ClassificationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import { normalizeClassificationMethod } from '$lib/features/commons/utils/discretization.utils';
import {
  CALENDAR_UNIT,
  type CalendarStep
} from '$lib/features/commons/utils/calendar-breaks.utils';
import * as m from '$lib/paraglide/messages';

const METHOD_LABELS: Record<ClassificationMethod, () => string> = {
  [ClassificationMethod.KMEANS]: m.discretization_method_kmeans,
  [ClassificationMethod.QUANTILES]: m.discretization_method_quantile,
  [ClassificationMethod.EQUAL_INTERVAL]: m.discretization_method_equal_interval,
  [ClassificationMethod.MANUAL]: m.discretization_method_manual,
  [ClassificationMethod.Q6]: m.discretization_method_q6,
  [ClassificationMethod.NESTED_MEANS]: m.discretization_method_nested_means,
  [ClassificationMethod.HEAD_TAIL]: m.discretization_method_head_tail,
  [ClassificationMethod.CALENDAR]: m.discretization_method_calendar
};

export function formatCalendarStepName(step: CalendarStep): string {
  switch (step.unit) {
    case CALENDAR_UNIT.DAY:
      return m.discretization_calendar_step_day();
    case CALENDAR_UNIT.WEEK:
      return m.discretization_calendar_step_week();
    case CALENDAR_UNIT.MONTH:
      if (step.count === 2) return m.discretization_calendar_step_bimonth();
      if (step.count === 3) return m.discretization_calendar_step_quarter();
      if (step.count === 6) return m.discretization_calendar_step_semester();
      return m.discretization_calendar_step_month();
    case CALENDAR_UNIT.YEAR:
      return step.count === 1
        ? m.discretization_calendar_step_year()
        : m.discretization_calendar_step_years({ count: step.count });
  }
}

export function toCalendarStepId(step: CalendarStep): string {
  return `${step.count}-${step.unit}`;
}

export function resolveDiscretizationLabel(
  classification: ClassificationConfig | undefined
): string {
  const method = normalizeClassificationMethod(classification?.method);
  const numClasses = classification?.numClasses ?? classification?.classes ?? 5;
  const methodLabel =
    method === ClassificationMethod.CALENDAR && classification?.calendarStep
      ? formatCalendarStepName(classification.calendarStep)
      : METHOD_LABELS[method]();

  return `${methodLabel}, ${numClasses} ${m.discretization_classes_suffix()}`;
}
