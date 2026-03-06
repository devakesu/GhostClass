import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

// Read and encode the icon once at module load time so subsequent requests
// do not pay the filesystem + base64 cost on every invocation.
const iconSrc = (() => {
  try {
    const buf = readFileSync(path.join(process.cwd(), 'public/icon-192.png'));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    // Icon unavailable — icon will render without logo
    return null;
  }
})();

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
