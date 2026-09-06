import { absoluteURL, pagePath, isPreview } from '../lib/settings.mjs';

export function GET() {
  const body = isPreview() ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nSitemap: ${absoluteURL(pagePath('sitemap.xml'))}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
