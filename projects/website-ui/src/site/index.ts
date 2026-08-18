import { WebsiteUiConfigurationException } from '../exceptions.js';

// default public base path used outside framework-owned configuration
export const DEFAULT_BASE_PATH = '/';

/**
 * Returns one normalized root-relative base path with a trailing slash.
 * @param basePath Candidate public base path.
 * @returns The normalized public base path.
 * @throws
 * - INVALID_BASE_PATH: The website base path contains unsupported URL characters.
 */
export const normalizeBasePath = (basePath: string): string => {
  const path = `/${basePath}`.replaceAll(/\/{2,}/g, '/');
  const normalizedPath = path === '/' ? '/' : `${path.replace(/\/$/, '')}/`;

  if (!/^\/(?:[a-zA-Z0-9._~-]+\/)*$/u.test(normalizedPath)) {
    throw new WebsiteUiConfigurationException('INVALID_BASE_PATH');
  }

  return normalizedPath;
};

/**
 * Prefixes one root-relative public route with the configured deployment base.
 * @param route Root-relative public route.
 * @param basePath Configured public base path.
 * @returns The base-aware route.
 * @throws
 * - INVALID_BASE_PATH: The website base path contains unsupported URL characters.
 */
export const withBase = (route: string, basePath = DEFAULT_BASE_PATH): string => {
  const base = normalizeBasePath(basePath);
  const routeWithoutRoot = route.replace(/^\//, '');

  return `${base}${routeWithoutRoot}`.replaceAll(/\/{2,}/g, '/');
};

/**
 * Checks whether a public pathname identifies a route or one of its descendants.
 * @param pathname Current public pathname.
 * @param route Root-relative public route.
 * @param basePath Configured public base path.
 * @returns Whether the route is active for the current pathname.
 * @throws
 * - INVALID_BASE_PATH: The website base path contains unsupported URL characters.
 */
export const isPublicRouteActive = (
  pathname: string,
  route: string,
  basePath = DEFAULT_BASE_PATH,
): boolean => {
  const publicRoute = withBase(route, basePath);

  return publicRoute === normalizeBasePath(basePath)
    ? pathname === publicRoute
    : pathname.startsWith(publicRoute);
};

/**
 * Builds a canonical absolute URL from an origin, base path, and public route.
 * @param route Root-relative public route.
 * @param siteUrl Public website origin.
 * @param basePath Public deployment base path.
 * @returns The canonical absolute URL.
 * @throws
 * - INVALID_BASE_PATH: The website base path contains unsupported URL characters.
 */
export const createCanonicalUrl = (route: string, siteUrl: string, basePath: string): string =>
  new URL(withBase(route, basePath), siteUrl).href;

// exceptions
export { WebsiteUiConfigurationException } from '../exceptions.js';
export type { IWebsiteUiConfigurationErrorCode } from '../exceptions.js';
