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

  it('remounts project-bound workspace content when the project runtime changes', () => {
    expect(source).toContain(
      "import { projectRuntime } from '$lib/features/commons/stores/project/project-runtime.svelte';"
    );
    expect(source).toContain('{#key projectRuntime.runtimeKey}');
    expect(source.indexOf('{#key projectRuntime.runtimeKey}')).toBeLessThan(
      source.indexOf('<MainToolbar />')
    );
    expect(source.indexOf('{#key projectRuntime.runtimeKey}')).toBeLessThan(
      source.indexOf('<MapTooltipOverlay />')
    );
  });
});
