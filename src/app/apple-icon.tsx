import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// Read and encode the icon once at module load time so subsequent requests
// do not pay the filesystem + base64 cost on every invocation.
const iconSrc = (() => {
  try {
    const buf = readFileSync(path.join(process.cwd(), 'public/icon-192.png'));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    // Icon unavailable — apple-icon will render without logo
    return null;
  }
})();

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
