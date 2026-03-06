import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0b0b0f',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img src={`${baseUrl}/favicon.svg`} width={28} height={28} />
      </div>
    ),
    { ...size }
  );
}
