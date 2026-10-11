// Reads a picked image into raw bytes plus its MIME type, for Supabase Storage uploads.
//
// Upload bytes (ArrayBuffer) with an explicit contentType, never a Blob: storage-js
// wraps a Blob in multipart form data, which React Native cannot encode (the file
// part is dropped), so Storage saw the request as text/plain and refused it
// ("mime type text/plain is not supported"). An ArrayBuffer is sent as the raw body
// with the content type we give it. Works on web too.

const BY_EXT: Record<string, string> = {
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

export type ImageBytes = { bytes: ArrayBuffer; mime: string; ext: string };

export async function readImage(uri: string): Promise<ImageBytes> {
  const response = await fetch(uri);
  const bytes = await response.arrayBuffer();
  const header = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  const fromUri = BY_EXT[uri.split('?')[0].split('.').pop()?.toLowerCase() ?? ''];
  const mime = header && header.startsWith('image/') ? header : fromUri ?? 'image/jpeg';
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/gif' ? 'gif' : 'jpg';
  return { bytes, mime, ext };
}
