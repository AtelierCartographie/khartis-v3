import { beforeEach, describe, expect, it } from 'vitest';
import { PageModel } from '$lib/features/commons/constants/ui.constants';
import { persistenceRegistry } from '$lib/features/project-management/core/persistence-registry';
import {
  formatActions,
  getFormatState,
  getLastPageResize
} from './format.store.svelte';

describe('format store page resize', () => {
  beforeEach(() => {
    formatActions.reset();
  });

  it('records the page size a user resize starts from', () => {
    formatActions.setModel(PageModel.A4_LANDSCAPE);
    const before = getLastPageResize()?.id ?? 0;

    formatActions.setModel(PageModel.A3_LANDSCAPE);

    expect(getLastPageResize()).toEqual({
      id: before + 1,
      from: { width: 842, height: 595 },
      to: { width: 1191, height: 842 }
    });
  });

  it('records no resize when a project restores another page size', () => {
    const before = getLastPageResize();

    persistenceRegistry.deserializeAll({
      format: { ...getFormatState(), width: 1191, height: 842 }
    });

    expect(getFormatState().width).toBe(1191);
    expect(getLastPageResize()).toEqual(before);
  });
});
