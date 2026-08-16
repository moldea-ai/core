// established public deployment defaults for local builds and non-deploying CI
export const DEFAULT_SITE_URL = 'https://packages.moldea.ai';
export const DEFAULT_BASE_PATH = '/';

/**
 * Returns one normalized root-relative base path with a trailing slash.
 * @throws
 * - The website base path contains unsupported URL characters.
 */
export const normalizeBasePath = (basePath: string): string => {
  const path = `/${basePath}`.replaceAll(/\/{2,}/g, '/');
  const normalizedPath = path === '/' ? '/' : `${path.replace(/\/$/, '')}/`;

  if (!/^\/(?:[a-zA-Z0-9._~-]+\/)*$/u.test(normalizedPath)) {
    throw new Error('The website base path contains unsupported URL characters.');
  }

  return normalizedPath;
};

/** Prefixes one root-relative public route with the configured deployment base. */
export const withBase = (route: string, basePath = import.meta.env.BASE_URL): string => {
  const base = normalizeBasePath(basePath);
  const routeWithoutRoot = route.replace(/^\//, '');

  return `${base}${routeWithoutRoot}`.replaceAll(/\/{2,}/g, '/');
};

/** Checks whether a public pathname identifies a route or one of its descendants. */
export const isPublicRouteActive = (
  pathname: string,
  route: string,
  basePath = import.meta.env.BASE_URL,
): boolean => pathname.startsWith(withBase(route, basePath));

/** Builds a canonical absolute URL from an origin, base path, and public route. */
export const createCanonicalUrl = (route: string, siteUrl: string, basePath: string): string =>
  new URL(withBase(route, basePath), siteUrl).href;
