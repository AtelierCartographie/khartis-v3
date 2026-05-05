import {
  getLocale,
  overwriteGetLocale,
  overwriteSetLocale,
  cookieName,
  cookieMaxAge,
  cookieDomain,
  type Locale
} from '$lib/paraglide/runtime.js';

let _reactiveLocale = $state<Locale>(getLocale());

overwriteGetLocale(() => _reactiveLocale);

overwriteSetLocale((newLocale, options) => {
  const previousLocale = _reactiveLocale;
  _reactiveLocale = newLocale;

  if (typeof document !== 'undefined') {
    const cookieString = `${cookieName}=${newLocale}; path=/; max-age=${cookieMaxAge}`;
    document.cookie = cookieDomain
      ? `${cookieString}; domain=${cookieDomain}`
      : cookieString;
  }

  const shouldReload = options?.reload !== false;
  if (
    shouldReload &&
    typeof window !== 'undefined' &&
    newLocale !== previousLocale
  ) {
    window.location.reload();
  }
});
