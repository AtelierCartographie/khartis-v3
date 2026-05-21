import type { HandleClientError } from '@sveltejs/kit';
import { LogCategory } from '$lib/features/commons/utils/logger';
import { posthogService } from '$lib/features/commons/services/posthog.service';

export const handleError: HandleClientError = ({ error, status, event }) => {
  if (status === 404) return;

  posthogService.captureException(error, {
    category: LogCategory.SYSTEM,
    flow: 'sveltekit_client_handle_error',
    extra: {
      route_id: event.route?.id ?? null,
      url: event.url?.toString() ?? null,
      status
    }
  });
};
