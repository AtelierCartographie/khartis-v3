import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';
import ColorBlindnessNotification from './color-blindness-notification.svelte';

describe('color-blindness notification', () => {
  it('renders the updated title, message and action', () => {
    render(ColorBlindnessNotification, {
      ondeactivate: vi.fn(),
      onclose: vi.fn()
    });

    expect(
      screen.getByText(m.colorblind_notification_title())
    ).toBeInTheDocument();
    expect(
      screen.getByText(m.colorblind_notification_message())
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: m.colorblind_deactivate() })
    ).toBeInTheDocument();
  });
});
