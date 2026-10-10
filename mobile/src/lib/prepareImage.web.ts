import * as ImagePicker from 'expo-image-picker';

export type PreparedImage = { blob: Blob; previewUri: string; width: number; height: number };

export const MAX_CHAT_IMAGE_BYTES = 1_500_000;
const LONG_EDGE = 1600;

// Web: pick, then redraw on a canvas scaled to a 1600 px long edge and re-encode as
// JPEG. That keeps uploads small and strips EXIF (location) metadata.
export async function pickChatImage(): Promise<PreparedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('bad_attachment'));
    el.src = asset.uri;
  });
  const scale = Math.min(1, LONG_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('bad_attachment');
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.75));
  if (!blob) throw new Error('bad_attachment');
  if (blob.size > MAX_CHAT_IMAGE_BYTES) throw new Error('photo_too_large');
  return { blob, previewUri: URL.createObjectURL(blob), width, height };
}
