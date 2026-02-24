import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';
import CsvOptionsModal, { type CsvOptions } from './csv-options-modal.svelte';

afterEach(cleanup);

const baseOptions: CsvOptions = {
  header: true,
  decimalSeparator: '.',
  thousandsSeparator: undefined,
  delimiter: undefined
};

describe('CsvOptionsModal', () => {
  it('maps space separator to stable select value on open', () => {
    const { container } = render(CsvOptionsModal, {
      props: {
        open: true,
        currentOptions: {
          ...baseOptions,
          thousandsSeparator: ' '
        },
        onClose: vi.fn(),
        onApply: vi.fn()
      }
    });

    const selects = container.querySelectorAll('select');
    expect(selects.length).toBeGreaterThanOrEqual(3);
    expect(selects[2]?.value).toBe('space');
  });

  it('applies space separator as a real space character', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const { container } = render(CsvOptionsModal, {
      props: {
        open: true,
        currentOptions: baseOptions,
        onClose,
        onApply
      }
    });

    const selects = container.querySelectorAll('select');
    expect(selects.length).toBeGreaterThanOrEqual(3);

    await fireEvent.change(selects[2] as HTMLSelectElement, {
      target: { value: 'space' }
    });

    await fireEvent.click(
      screen.getByRole('button', { name: m.csv_options_apply() })
    );

    expect(onApply).toHaveBeenCalledWith({
      header: true,
      decimalSeparator: '.',
      thousandsSeparator: ' ',
      delimiter: undefined
    });
    expect(onClose).toHaveBeenCalled();
  });
});
