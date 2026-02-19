import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EnrichmentFileUpload from './enrichment-file-upload.svelte';

afterEach(cleanup);

describe('EnrichmentFileUpload', () => {
  function createProps() {
    return {
      isUploading: false,
      pastedDataValue: '',
      onlineUrlValue: '',
      onFileUpload: vi.fn(),
      onPasteData: vi.fn(),
      onLoadOnlineFile: vi.fn(),
      onPastedDataChange: vi.fn(),
      onUrlChange: vi.fn()
    };
  }

  it('propagates textarea input value to pasted data callback', async () => {
    const props = createProps();
    const { container } = render(EnrichmentFileUpload, { props });
    const textarea = container.querySelector('textarea');

    expect(textarea).not.toBeNull();

    await fireEvent.input(textarea!, {
      target: { value: 'id,city\n1,Paris' }
    });

    expect(props.onPastedDataChange).toHaveBeenCalledWith('id,city\n1,Paris');
  });

  it('propagates text input value to URL callback', async () => {
    const props = createProps();
    const { container } = render(EnrichmentFileUpload, { props });
    const urlInput = container.querySelector('.bx--text-input');

    expect(urlInput).not.toBeNull();

    await fireEvent.input(urlInput!, {
      target: { value: 'https://example.com/data.csv' }
    });

    expect(props.onUrlChange).toHaveBeenCalledWith(
      'https://example.com/data.csv'
    );
  });
});
