import type { HandleClientError } from '@sveltejs/kit';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

export const handleError: HandleClientError = ({ error, status, event }) => {
  if (status === 404) return;

  logger.error('Unhandled client error', LogCategory.SYSTEM, error, {
    flow: 'sveltekit_client_handle_error',
    extra: {
      route_id: event.route?.id ?? null,
      url: event.url?.toString() ?? null,
      status
    }
  });
};
