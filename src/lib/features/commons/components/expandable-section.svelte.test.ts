import { fireEvent, render, screen } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import ExpandableSection from './expandable-section.svelte';

const source = readFileSync(
  resolve(import.meta.dirname, 'expandable-section.svelte'),
  'utf8'
);

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

  it('renders description text and keeps disabled expandable controls inert', async () => {
    render(ExpandableSection, {
      title: 'Lacs et rivières',
      description: 'Indisponible pour le fond de carte actif',
      showToggle: true,
      disabled: true
    });

    const button = screen.getByRole('button', { name: /lacs et rivières/i });
    const toggle = screen.getByRole('switch', { name: /lacs et rivières/i });

    expect(
      screen.getByText('Indisponible pour le fond de carte actif')
    ).toBeInTheDocument();
    expect(button).toBeDisabled();
    expect(toggle).toBeDisabled();

    await fireEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('forwards the suggestions toggle variant to the shared switch', () => {
    render(ExpandableSection, {
      title: 'Projection settings',
      showToggle: true,
      toggleChecked: true,
      toggleVariant: 'suggestions'
    });

    const toggle = screen.getByRole('switch', { name: /projection settings/i });

    expect(toggle.closest('label')).toHaveClass('variant-suggestions');
    expect(toggle.closest('label')).toHaveClass('sm');
  });

  it('keeps disabled end actions visible but inert', () => {
    const icon = createRawSnippet(() => ({
      render: () => '<button type="button">Filter</button>'
    }));

    const { container } = render(ExpandableSection, {
      title: 'Symbols',
      actionsEnd: true,
      disabled: true,
      icon
    });

    const actions = container.querySelector('.section-actions-end');

    expect((actions as HTMLElement).inert).toBe(true);
    expect(actions).toHaveClass('disabled');
  });

  it('allows scoped surface tokens for themed parent sections', () => {
    expect(source).toContain('--khartis-expandable-section-background');
    expect(source).toContain('--khartis-expandable-section-hover-background');
    expect(source).toContain('.section-header:hover:not(.disabled)');
  });
});
