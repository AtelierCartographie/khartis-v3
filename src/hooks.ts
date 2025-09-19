import { deLocalizeUrl } from '$lib/paraglide/runtime';

export const reroute = (request: { url: URL | string }) =>
  deLocalizeUrl(request.url).pathname;
