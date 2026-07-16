const WORKBOX_REVISION_QUERY_PARAM = '__WB_REVISION__';

export function canonicalizeWorkboxPrecacheRequest(request: Request): Request {
  const url = new URL(request.url);
  if (!url.searchParams.has(WORKBOX_REVISION_QUERY_PARAM)) {
    return request;
  }

  url.searchParams.delete(WORKBOX_REVISION_QUERY_PARAM);
  return new Request(url.href);
}
