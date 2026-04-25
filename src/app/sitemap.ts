import type { MetadataRoute } from 'next';
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (!baseUrl) return [];
  // Use BUILD_TIMESTAMP for stable, deterministic lastModified across requests.
  // Omit lastModified when not set or invalid (e.g. local dev) to avoid non-deterministic dates.
  const lastModified = (() => {
    if (!process.env.BUILD_TIMESTAMP) return undefined;
    const d = new Date(process.env.BUILD_TIMESTAMP);
    return isNaN(d.getTime()) ? undefined : d;
  })();

  const publicPages: Array<{ path: string; priority: number }> = [
    { path: '', priority: 1 },
    { path: '/contact', priority: 0.8 },
    { path: '/help', priority: 0.7 },
    { path: '/legal', priority: 0.8 },
    { path: '/build-info', priority: 0.4 },
    { path: '/api-docs', priority: 0.3 },
  ];

  return [
    ...publicPages.map(({ path, priority }) => ({
      url: `${baseUrl}${path}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority,
    })),
  ];
}