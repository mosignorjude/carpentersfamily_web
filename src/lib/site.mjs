/**
 * @fileoverview The single public origin for canonical URLs, OG tags and the
 * sitemap. carpentersfamily.com.ng answers 308 and hands the visitor to
 * www.carpentersfamily.com.ng, which is the host that actually serves the site
 * — so naming the apex anywhere would tell a crawler the canonical URL is one
 * that only redirects.
 */

export const SITE_ORIGIN = "https://www.carpentersfamily.com.ng";

/**
 * Absolute public URL for a site path: siteUrl("/tickets").
 * @param {string} path
 * @returns {string}
 */
export function siteUrl(path) {
  return `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}
