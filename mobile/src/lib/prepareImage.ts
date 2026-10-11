import * as ImagePicker from 'expo-image-picker';

// A photo ready to upload to a chat: the raw bytes (uploaded as an ArrayBuffer, because a
// React Native Blob inside multipart form data reaches Storage without a usable content
// type), its MIME type, a local preview URI, and its size.
export type PreparedImage = { bytes: ArrayBuffer; mime: string; previewUri: string; width: number; height: number };

export const MAX_CHAT_IMAGE_BYTES = 3_000_000;

// The picker re-encodes at quality < 1: the output is PNG only for .png sources and JPEG
// bytes for everything else (even when the file keeps a .webp/.gif extension), and
// asset.mimeType describes the SOURCE, so take the type from the extension alone.
function mimeFrom(uri: string): string {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  return ext === 'png' ? 'image/png' : 'image/jpeg';
}

// Native: pick with the system Photo Picker (no permission needed; Play restricts
// broad media permissions), compress via the picker's quality setting, and refuse
// anything still over the server cap (3 MB). Native downscaling needs the
// image-manipulator module, which would require a new build; web downscales instead
// (prepareImage.web.ts). exif:false keeps GPS data out of the picked asset.
export async function pickChatImage(): Promise<PreparedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.4, exif: false });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const bytes = await (await fetch(asset.uri)).arrayBuffer();
  if (bytes.byteLength > MAX_CHAT_IMAGE_BYTES) throw new Error('photo_too_large');
  return {
    bytes,
    mime: mimeFrom(asset.uri),
    previewUri: asset.uri,
    width: asset.width || 1,
    height: asset.height || 1,
  };
}
