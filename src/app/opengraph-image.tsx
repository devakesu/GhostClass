import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'GhostClass — Smart Attendance Tracker';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0b0b0f',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 32,
        }}
      >
        <img
          src={`${baseUrl}/favicon.svg`}
          width={160}
          height={160}
          style={{ borderRadius: 24 }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 72, fontWeight: 800, color: '#ffffff', letterSpacing: '-2px' }}>
            GhostClass
          </span>
          <span style={{ fontSize: 32, color: '#a855f7', fontWeight: 500 }}>
            Survive Attendance 👻
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
