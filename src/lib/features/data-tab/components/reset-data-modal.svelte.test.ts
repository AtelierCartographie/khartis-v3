import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';

const mocks = vi.hoisted(() => ({
  datasets: [
    {
      id: 'dataset-1',
      name: 'Countries.csv'
    }
  ],
  hasModificationsMock: vi.fn((_datasetId: string) => true),
  resetDatasetMock: vi.fn((_datasetId: string) => Promise.resolve(true)),
  showSuccessMock: vi.fn(),
  showErrorMock: vi.fn()
}));

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
  datasetsStore: {
    get datasets() {
      return mocks.datasets;
    },
    hasModifications: (datasetId: string) =>
      mocks.hasModificationsMock(datasetId),
    resetDataset: (datasetId: string) => mocks.resetDatasetMock(datasetId)
  }
}));

vi.mock('$lib/features/commons/utils/notification.utils.svelte', () => ({
  showSuccess: (...args: unknown[]) => mocks.showSuccessMock(...args),
  showError: (...args: unknown[]) => mocks.showErrorMock(...args)
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    DATA: 'DATA'
  },
  logger: {
    error: vi.fn()
  }
}));

import ResetDataModal from './reset-data-modal.svelte';

describe('reset-data-modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasModificationsMock.mockReturnValue(true);
    mocks.resetDatasetMock.mockResolvedValue(true);
  });

  it('runs the reset flow once when the primary button is clicked', async () => {
    const onSuccess = vi.fn();

    render(ResetDataModal, {
      open: true,
      datasetId: 'dataset-1',
      onSuccess
    });

    const resetButton = await screen.findByRole('button', {
      name: m.reset_data_modal_button()
    });

    await fireEvent.click(resetButton);

    await waitFor(() => {
      expect(mocks.resetDatasetMock).toHaveBeenCalledTimes(1);
    });
    expect(mocks.resetDatasetMock).toHaveBeenCalledWith('dataset-1');
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(mocks.showSuccessMock).toHaveBeenCalledTimes(1);
  });

  it('warns that linked visualizations are lost', () => {
    render(ResetDataModal, {
      open: true,
      datasetId: 'dataset-1'
    });

    expect(screen.getByText(m.reset_data_modal_warning())).toBeTruthy();
  });
});
