import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'main-toolbar.svelte'),
  'utf8'
);

describe('MainToolbar', () => {
  it('hides the desktop main toolbar when the styling step is selected', () => {
    expect(source).toContain(
      'hidden={globalState.selectedStep === ToolbarStep.Styling}'
    );
  });
});
