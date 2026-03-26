/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from 'next/og';
import { readPublicPngAsDataUri } from '@/lib/read-public-icon';

export const runtime = 'nodejs';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// Read and encode the icon once at module load time so subsequent requests
// do not pay the filesystem + base64 cost on every invocation.
const iconSrc = readPublicPngAsDataUri('icon-192.png');

export default function AppleIcon() {
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
        {iconSrc && <img src={iconSrc} width={160} height={160} />}
      </div>
    ),
    { ...size }
  );
}
