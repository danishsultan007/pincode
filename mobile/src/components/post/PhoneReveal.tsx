import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { space } from '@/theme/tokens';
import { copy } from '@/lib/copy';
import { messageFor } from '@/lib/errors';
import { useToast } from '@/providers/ToastProvider';

export type PhoneRevealProps = {
  reveal: () => Promise<string | null>;
  disabled?: boolean;
};

export function PhoneReveal({ reveal, disabled }: PhoneRevealProps) {
  const toast = useToast();
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleShow = async () => {
    setLoading(true);
    try {
      const number = await reveal();
      if (number) setPhone(number);
      else toast.show(copy.common.somethingWentWrong);
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setLoading(false);
    }
  };

  if (!phone) {
    return <Button label={copy.post.showNumber} variant="ghost" onPress={handleShow} loading={loading} disabled={disabled} icon="phone" />;
  }

  const digits = phone.replace(/[^\d]/g, '');
  return (
    <View style={styles.row}>
      <Text variant="body" numeric>
        {phone}
      </Text>
      <Button label={copy.post.call} size="sm" variant="ghost" icon="phone" onPress={() => Linking.openURL(`tel:${phone}`)} />
      <Button
        label={copy.post.whatsapp}
        size="sm"
        variant="ghost"
        icon="message"
        onPress={() => Linking.openURL(`https://wa.me/${digits}`)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s2, flexWrap: 'wrap' },
});
