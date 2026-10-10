import React from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '@/components/ui/IconButton';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';

// Full-screen photo viewer: dark backdrop, image fitted to the screen, tap anywhere
// or the close button (or Back) to dismiss. No pinch-to-zoom: that needs a gesture
// library, which would mean a new native build.
export function PhotoViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={!!uri}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={copy.chat.closePhoto} />
        {uri ? (
          // The wrapper lets taps fall through to the dismiss layer behind the image.
          <View style={styles.imageWrap} pointerEvents="none">
            <Image source={{ uri }} style={styles.image} resizeMode="contain" accessibilityIgnoresInvertColors />
          </View>
        ) : null}
        <View style={[styles.close, { top: insets.top + space.s2 }]}>
          <IconButton name="x" label={copy.chat.closePhoto} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' },
  imageWrap: { ...StyleSheet.absoluteFill },
  image: { width: '100%', height: '100%' },
  close: { position: 'absolute', right: space.s3 },
});
