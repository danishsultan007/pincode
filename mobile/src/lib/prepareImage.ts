import * as ImagePicker from 'expo-image-picker';

// A photo ready to upload to a chat: the bytes, a local preview URI, and its size.
export type PreparedImage = { blob: Blob; previewUri: string; width: number; height: number };

export const MAX_CHAT_IMAGE_BYTES = 1_500_000;

// Native: pick with the system Photo Picker (no permission needed; Play restricts
// broad media permissions), compress via the picker's quality setting, and refuse
// anything still over the server's 1.5 MB cap. Native downscaling needs the
// image-manipulator module, which would require a new build; web downscales instead
// (prepareImage.web.ts). exif:false keeps GPS data out of the picked asset.
export async function pickChatImage(): Promise<PreparedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, exif: false });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const blob = await (await fetch(asset.uri)).blob();
  if (blob.type === 'image/gif') throw new Error('bad_attachment');
  if (blob.size > MAX_CHAT_IMAGE_BYTES) throw new Error('photo_too_large');
  return { blob, previewUri: asset.uri, width: asset.width || 1, height: asset.height || 1 };
}
