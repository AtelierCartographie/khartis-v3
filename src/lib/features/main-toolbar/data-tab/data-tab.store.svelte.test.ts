import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dataTabStore } from './data-tab.store.svelte';

describe('dataTabStore - step completion', () => {
  beforeEach(() => {
    dataTabStore.reset();
  });

  afterEach(() => {
    dataTabStore.reset();
  });

  describe('markStepComplete', () => {
    it('should mark control step (index 0) as complete', () => {
      expect(dataTabStore.hasCompletedStep[0]).toBe(false);

      dataTabStore.markStepComplete(0);

      expect(dataTabStore.hasCompletedStep[0]).toBe(true);
    });

    it('should mark geolocate step (index 1) as complete', () => {
      expect(dataTabStore.hasCompletedStep[1]).toBe(false);

      dataTabStore.markStepComplete(1);

      expect(dataTabStore.hasCompletedStep[1]).toBe(true);
    });

    it('should mark join step (index 2) as complete', () => {
      expect(dataTabStore.hasCompletedStep[2]).toBe(false);

      dataTabStore.markStepComplete(2);

      expect(dataTabStore.hasCompletedStep[2]).toBe(true);
    });

    it('should enable navigation to next step when current step is completed', () => {
      expect(dataTabStore.canNavigateToStep[1]).toBe(false);
      expect(dataTabStore.canNavigateToStep[2]).toBe(false);

      dataTabStore.markStepComplete(0);

      expect(dataTabStore.canNavigateToStep[1]).toBe(true);
      expect(dataTabStore.canNavigateToStep[2]).toBe(false);

      dataTabStore.markStepComplete(1);

      expect(dataTabStore.canNavigateToStep[2]).toBe(true);
    });

    it('should not throw for invalid negative index', () => {
      expect(() => dataTabStore.markStepComplete(-1)).not.toThrow();
    });

    it('should not throw for index beyond max', () => {
      expect(() => dataTabStore.markStepComplete(10)).not.toThrow();
    });
  });

  describe('resetStepCompletion', () => {
    it('should reset control step completion', () => {
      dataTabStore.markStepComplete(0);
      expect(dataTabStore.hasCompletedStep[0]).toBe(true);

      dataTabStore.resetStepCompletion(0);

      expect(dataTabStore.hasCompletedStep[0]).toBe(false);
    });

    it('should reset join step completion', () => {
      dataTabStore.markStepComplete(2);
      expect(dataTabStore.hasCompletedStep[2]).toBe(true);

      dataTabStore.resetStepCompletion(2);

      expect(dataTabStore.hasCompletedStep[2]).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset all step completions', () => {
      dataTabStore.markStepComplete(0);
      dataTabStore.markStepComplete(1);
      dataTabStore.markStepComplete(2);

      dataTabStore.reset();

      expect(dataTabStore.hasCompletedStep[0]).toBe(false);
      expect(dataTabStore.hasCompletedStep[1]).toBe(false);
      expect(dataTabStore.hasCompletedStep[2]).toBe(false);
    });

    it('should reset navigation permissions', () => {
      dataTabStore.markStepComplete(0);
      dataTabStore.markStepComplete(1);
      expect(dataTabStore.canNavigateToStep[1]).toBe(true);
      expect(dataTabStore.canNavigateToStep[2]).toBe(true);

      dataTabStore.reset();

      expect(dataTabStore.canNavigateToStep[0]).toBe(true);
      expect(dataTabStore.canNavigateToStep[1]).toBe(false);
      expect(dataTabStore.canNavigateToStep[2]).toBe(false);
    });
  });

  describe('isReadyForVisualization', () => {
    it('should return false when join step is not complete in tabular mode', () => {
      dataTabStore.markStepComplete(0);
      dataTabStore.markStepComplete(1);

      expect(dataTabStore.isReadyForVisualization).toBe(false);
    });

    it('should return true when join step is complete in tabular mode', () => {
      dataTabStore.markStepComplete(0);
      dataTabStore.markStepComplete(1);
      dataTabStore.markStepComplete(2);

      expect(dataTabStore.isReadyForVisualization).toBe(true);
    });
  });

  describe('default state', () => {
    it('should have all steps incomplete by default', () => {
      expect(dataTabStore.hasCompletedStep[0]).toBe(false);
      expect(dataTabStore.hasCompletedStep[1]).toBe(false);
      expect(dataTabStore.hasCompletedStep[2]).toBe(false);
    });

    it('should only allow navigation to first step by default', () => {
      expect(dataTabStore.canNavigateToStep[0]).toBe(true);
      expect(dataTabStore.canNavigateToStep[1]).toBe(false);
      expect(dataTabStore.canNavigateToStep[2]).toBe(false);
    });

    it('should have auto workflow mode by default', () => {
      expect(dataTabStore.workflowMode).toBe('auto');
    });

    it('should have step count of 3 in tabular mode', () => {
      expect(dataTabStore.stepCount).toBe(3);
    });
  });
});
