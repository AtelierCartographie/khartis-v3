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
  });
});
