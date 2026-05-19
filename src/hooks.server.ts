import { paraglideMiddleware } from '$lib/paraglide/server';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import * as m from '$lib/paraglide/messages';

function withCrossOriginIsolationHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');

  try {
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    response.headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
    return response;
  } catch {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
}

const handleDevTools: Handle = ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/.well-known/')) {
    return new Response('Not Found', { status: 404 });
  }

  return resolve(event);
};

const handleParaglide: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ request, locale }) => {
    event.request = request;

    const response = resolve(event, {
      transformPageChunk: ({ html }) =>
        html
          .replace('%paraglide.lang%', locale)
          .replace(/%app\.name%/g, m.app_name())
          .replace(/%app\.description%/g, m.app_description())
    });

    if (response instanceof Promise) {
      return response.then(withCrossOriginIsolationHeaders);
    }

    return withCrossOriginIsolationHeaders(response);
  });

export const handle: Handle = sequence(handleDevTools, handleParaglide);
