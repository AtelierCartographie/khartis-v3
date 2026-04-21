import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, '../routes/+layout.svelte'),
  'utf8'
);

describe('+layout color-blindness notification', () => {
  it('reuses the shared notification component', () => {
    expect(source).toContain('ColorBlindnessNotification');
  });

  it('shows the floating notification only on mobile when the tool is not already open', () => {
    expect(source).toContain(
      'showMobileColorBlindnessNotification = $derived('
    );
    expect(source).toContain('globalState.isMobileView &&');
    expect(source).toContain(
      'globalState.selectedStep !== ToolbarStep.Styling'
    );
    expect(source).toContain('!globalState.selectedTool');
  });
});
