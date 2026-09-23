import { getContext, setContext } from 'svelte';

const MISSING_DATA_AVAILABILITY_KEY = Symbol('missing-data-availability');

type MissingDataAvailability = () => boolean;

export function setMissingDataAvailability(
  hasMissingData: MissingDataAvailability
): void {
  setContext(MISSING_DATA_AVAILABILITY_KEY, hasMissingData);
}

export function getMissingDataAvailability(): MissingDataAvailability {
  return (
    getContext<MissingDataAvailability | undefined>(
      MISSING_DATA_AVAILABILITY_KEY
    ) ?? (() => true)
  );
}
