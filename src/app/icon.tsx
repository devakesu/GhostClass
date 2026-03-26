/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from 'next/og';
import { readPublicPngAsDataUri } from '@/lib/read-public-icon';

export const runtime = 'nodejs';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

// Read and encode the icon once at module load time so subsequent requests
// do not pay the filesystem + base64 cost on every invocation.
const iconSrc = readPublicPngAsDataUri('icon-192.png');

export default function Icon() {
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
        {iconSrc && <img src={iconSrc} width={28} height={28} />}
      </div>
    ),
    { ...size }
  );
}
