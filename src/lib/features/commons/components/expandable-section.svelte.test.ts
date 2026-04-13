import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ExpandableSection from './expandable-section.svelte';

describe('ExpandableSection', () => {
  it('toggles a collapsed section when its header button is clicked', async () => {
    render(ExpandableSection, {
      title: 'Projection settings'
    });

    const button = screen.getByRole('button', { name: /projection settings/i });

    expect(button).toHaveAttribute('aria-expanded', 'false');

    await fireEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
  });
});
