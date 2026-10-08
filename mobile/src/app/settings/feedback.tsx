import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Segmented } from '@/components/ui/Segmented';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/providers/ToastProvider';
import { sendFeedback, type FeedbackCategory } from '@/api/feedback';
import { messageFor } from '@/lib/errors';
import { space } from '@/theme/tokens';
import { goBack } from '@/lib/nav';

export default function Feedback() {
  const toast = useToast();
  const [category, setCategory] = useState<FeedbackCategory>('idea');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await sendFeedback({ message, category });
      toast.show('Thanks — we read every message.');
      setMessage('');
      goBack();
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Header large title="Send feedback" left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />} />
      <View style={styles.body}>
        <Text variant="body">Found a bug or have an idea? Tell us — pincode is in beta and your feedback shapes it.</Text>
        <Segmented
          options={[
            { value: 'bug', label: 'Bug' },
            { value: 'idea', label: 'Idea' },
            { value: 'other', label: 'Other' },
          ]}
          value={category}
          onChange={(v) => setCategory(v as FeedbackCategory)}
          full
        />
        <TextField
          label="Your message"
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={2000}
          placeholder="What happened, or what would you like to see?"
        />
        <Button size="lg" label="Send" onPress={submit} loading={busy} disabled={message.trim().length < 3} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.s4, paddingBottom: space.s6, gap: space.s4, width: '100%', maxWidth: 480, alignSelf: 'center' },
});
