import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ExpandableSection from './expandable-section.svelte';

vi.mock('$lib/paraglide/messages', () => ({
  m: {
    section_toggle: () => 'Toggle section'
  }
}));

afterEach(cleanup);

describe('ExpandableSection', () => {
  it('renders collapsed by default', () => {
    const { container } = render(ExpandableSection, {
      props: { title: 'Test Section' }
    });

    expect(screen.getByText('Test Section')).toBeInTheDocument();
    expect(container.querySelector('.section-body')).not.toBeInTheDocument();

    const header = screen.getByRole('button', { name: 'Toggle section' });
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders expanded when defaultOpen is true', () => {
    const { container } = render(ExpandableSection, {
      props: { title: 'Open Section', defaultOpen: true }
    });

    const btn = screen.getByRole('button', { name: 'Toggle section' });
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('.section-body')).toBeInTheDocument();
  });

  it('expands on header click', async () => {
    render(ExpandableSection, { props: { title: 'Clickable' } });

    const header = screen.getByRole('button', { name: 'Toggle section' });
    expect(header).toHaveAttribute('aria-expanded', 'false');

    await fireEvent.click(header);
    await tick();

    expect(header).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapses on second header click', async () => {
    render(ExpandableSection, {
      props: { title: 'Toggle Click', defaultOpen: true }
    });

    const header = screen.getByRole('button', { name: 'Toggle section' });
    expect(header).toHaveAttribute('aria-expanded', 'true');

    await fireEvent.click(header);
    await tick();

    expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  it('calls onToggle callback on header click', async () => {
    const onToggle = vi.fn();
    render(ExpandableSection, {
      props: { title: 'Callback Test', onToggle }
    });

    const header = screen.getByRole('button', { name: 'Toggle section' });
    await fireEvent.click(header);
    await tick();

    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('blocks header click when disabled', async () => {
    render(ExpandableSection, {
      props: { title: 'Disabled', disabled: true, defaultOpen: true }
    });

    const header = screen.getByRole('button', { name: 'Toggle section' });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(header).toHaveAttribute('aria-disabled', 'true');

    await fireEvent.click(header);
    await tick();

    expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows disabledReason as title when disabled', () => {
    render(ExpandableSection, {
      props: {
        title: 'Disabled Section',
        disabled: true,
        disabledReason: 'Feature not available'
      }
    });

    const header = screen.getByRole('button', { name: 'Toggle section' });
    expect(header).toHaveAttribute('title', 'Feature not available');
  });

  it('renders with count suffix', () => {
    render(ExpandableSection, {
      props: { title: 'Items', count: 5 }
    });

    expect(screen.getByText('Items (5)')).toBeInTheDocument();
  });

  describe('with toggle', () => {
    it('starts collapsed when toggleChecked is false', () => {
      render(ExpandableSection, {
        props: {
          title: 'Toggled',
          showToggle: true,
          toggleChecked: false,
          onToggleChange: vi.fn()
        }
      });

      const header = screen.getByRole('button', { name: 'Toggle section' });
      expect(header).toHaveAttribute('aria-expanded', 'false');
    });

    it('starts expanded when toggleChecked and defaultOpen are both true', () => {
      render(ExpandableSection, {
        props: {
          title: 'Toggled Open',
          showToggle: true,
          toggleChecked: true,
          defaultOpen: true,
          onToggleChange: vi.fn()
        }
      });

      const header = screen.getByRole('button', { name: 'Toggle section' });
      expect(header).toHaveAttribute('aria-expanded', 'true');
    });

    it('starts collapsed when toggleChecked is true but defaultOpen is false', () => {
      render(ExpandableSection, {
        props: {
          title: 'Toggled No Default',
          showToggle: true,
          toggleChecked: true,
          defaultOpen: false,
          onToggleChange: vi.fn()
        }
      });

      const header = screen.getByRole('button', { name: 'Toggle section' });
      expect(header).toHaveAttribute('aria-expanded', 'false');
    });

    it('blocks header click when toggle is OFF', async () => {
      render(ExpandableSection, {
        props: {
          title: 'Toggle Off',
          showToggle: true,
          toggleChecked: false,
          onToggleChange: vi.fn()
        }
      });

      const header = screen.getByRole('button', { name: 'Toggle section' });
      await fireEvent.click(header);
      await tick();

      expect(header).toHaveAttribute('aria-expanded', 'false');
    });

    it('allows header click when toggle is ON', async () => {
      render(ExpandableSection, {
        props: {
          title: 'Toggle On',
          showToggle: true,
          toggleChecked: true,
          defaultOpen: true,
          onToggleChange: vi.fn()
        }
      });

      const header = screen.getByRole('button', { name: 'Toggle section' });
      expect(header).toHaveAttribute('aria-expanded', 'true');

      await fireEvent.click(header);
      await tick();

      expect(header).toHaveAttribute('aria-expanded', 'false');
    });

    it('auto-expands when toggleChecked changes from false to true', async () => {
      const { rerender } = render(ExpandableSection, {
        props: {
          title: 'Auto Expand',
          showToggle: true,
          toggleChecked: false,
          onToggleChange: vi.fn()
        }
      });

      const header = screen.getByRole('button', { name: 'Toggle section' });
      expect(header).toHaveAttribute('aria-expanded', 'false');

      await rerender({
        title: 'Auto Expand',
        showToggle: true,
        toggleChecked: true,
        onToggleChange: vi.fn()
      });
      await tick();

      expect(header).toHaveAttribute('aria-expanded', 'true');
    });

    it('auto-collapses when toggleChecked changes from true to false', async () => {
      const { rerender } = render(ExpandableSection, {
        props: {
          title: 'Auto Collapse',
          showToggle: true,
          toggleChecked: true,
          defaultOpen: true,
          onToggleChange: vi.fn()
        }
      });

      const header = screen.getByRole('button', { name: 'Toggle section' });
      expect(header).toHaveAttribute('aria-expanded', 'true');

      await rerender({
        title: 'Auto Collapse',
        showToggle: true,
        toggleChecked: false,
        defaultOpen: true,
        onToggleChange: vi.fn()
      });
      await tick();

      expect(header).toHaveAttribute('aria-expanded', 'false');
    });

    it('calls onToggleChange when Carbon Toggle fires event', async () => {
      const onToggleChange = vi.fn();
      render(ExpandableSection, {
        props: {
          title: 'Toggle Event',
          showToggle: true,
          toggleChecked: false,
          onToggleChange
        }
      });

      // Carbon Toggle renders a checkbox input
      const checkbox = screen.getByRole('switch') as HTMLInputElement;
      await fireEvent.click(checkbox);
      await tick();

      expect(onToggleChange).toHaveBeenCalled();
    });

    it('Toggle click does NOT trigger onToggle (expand/collapse)', async () => {
      const onToggle = vi.fn();
      const onToggleChange = vi.fn();
      render(ExpandableSection, {
        props: {
          title: 'Isolated Toggle',
          showToggle: true,
          toggleChecked: true,
          defaultOpen: true,
          onToggle,
          onToggleChange
        }
      });

      // Click the Carbon Toggle switch — should only call onToggleChange, not onToggle
      const checkbox = screen.getByRole('switch') as HTMLInputElement;
      await fireEvent.click(checkbox);
      await tick();

      expect(onToggleChange).toHaveBeenCalled();
      expect(onToggle).not.toHaveBeenCalled();
    });
  });

  it('expands via keyboard Enter on header', async () => {
    render(ExpandableSection, { props: { title: 'Keyboard' } });

    const header = screen.getByRole('button', { name: 'Toggle section' });
    await fireEvent.keyDown(header, { key: 'Enter' });
    await tick();

    expect(header).toHaveAttribute('aria-expanded', 'true');
  });

  it('expands via keyboard Space on header', async () => {
    render(ExpandableSection, { props: { title: 'Space Key' } });

    const header = screen.getByRole('button', { name: 'Toggle section' });
    await fireEvent.keyDown(header, { key: ' ' });
    await tick();

    expect(header).toHaveAttribute('aria-expanded', 'true');
  });
});
