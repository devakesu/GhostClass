import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/profile', '/notifications', '/tracking', '/dashboard', '/accept-terms', '/scores'],
    },
    sitemap: process.env.NEXT_PUBLIC_SITEMAP_URL,
  };
}