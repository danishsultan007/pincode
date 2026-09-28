import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { IconButton } from '@/components/ui/IconButton';
import { space } from '@/theme/tokens';
import { postLink, shareNative, shareWhatsApp } from '@/lib/share';
import { copy } from '@/lib/copy';
import { useToast } from '@/providers/ToastProvider';

export type ShareRowProps = { postId: string; title: string };

export function ShareRow({ postId, title }: ShareRowProps) {
  const toast = useToast();
  const link = postLink(postId);

  const handleWhatsApp = () => shareWhatsApp(title, link);
  const handleShare = () => (Platform.OS === 'web' ? handleWhatsApp() : shareNative(title, link));
  const handleCopy = async () => {
    await Clipboard.setStringAsync(link);
    toast.show(copy.post.linkCopied);
  };

  return (
    <View style={styles.row}>
      <IconButton name="message" label={copy.post.whatsapp} onPress={handleWhatsApp} />
      <IconButton name="share" label="Share" onPress={handleShare} />
      <IconButton name="link" label="Copy link" onPress={handleCopy} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s1 },
});
