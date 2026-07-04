import {
  getLocale,
  overwriteGetLocale,
  overwriteSetLocale,
  cookieName,
  cookieMaxAge,
  cookieDomain,
  type Locale
} from '$lib/paraglide/runtime.js';

const initialLocale = getLocale();
let _reactiveLocale = $state<Locale>(initialLocale);

function applyDocumentLocale(locale: Locale): void {
  if (typeof document === 'undefined') return;

  document.documentElement.lang = locale;
}

applyDocumentLocale(initialLocale);

overwriteGetLocale(() => _reactiveLocale);

overwriteSetLocale((newLocale, options) => {
  const previousLocale = _reactiveLocale;
  _reactiveLocale = newLocale;
  applyDocumentLocale(newLocale);

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
