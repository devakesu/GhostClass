import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  const sitemapUrl = process.env.NEXT_PUBLIC_SITEMAP_URL ?? (baseUrl ? `${baseUrl}/sitemap.xml` : undefined);

  const disallowedPaths = [
    '/dashboard',
    '/profile',
    '/notifications',
    '/tracking',
    '/scores',
    '/leave-applications',
    '/accept-terms',
  ];

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: disallowedPaths,
    },
    sitemap: sitemapUrl,
  };
}