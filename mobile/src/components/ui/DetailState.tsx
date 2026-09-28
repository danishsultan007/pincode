import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from './Screen';
import { Header } from './Header';
import { IconButton } from './IconButton';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';
import { Button } from './Button';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';
import { goBack } from '@/lib/nav';

// Full-screen placeholder for detail routes (post, community, profile) while
// their main query is loading, has failed, or found nothing.
export type DetailStateProps =
  | { kind: 'loading' }
  | { kind: 'error'; onRetry: () => void }
  | { kind: 'notFound'; text: string };

export function DetailState(props: DetailStateProps) {
  return (
    <Screen>
      <Header left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />} />
      {props.kind === 'loading' ? (
        <View style={styles.skeleton} accessibilityLabel={copy.common.loading}>
          <Skeleton width="40%" height={12} />
          <Skeleton width="90%" height={22} />
          <Skeleton width="70%" height={22} />
          <Skeleton height={14} />
          <Skeleton height={14} />
          <Skeleton width="60%" height={14} />
        </View>
      ) : props.kind === 'error' ? (
        <EmptyState
          title={copy.common.somethingWentWrong}
          text={copy.common.checkConnection}
          actions={<Button label={copy.common.retry} variant="ghost" onPress={props.onRetry} />}
        />
      ) : (
        <EmptyState title={copy.common.notFound} text={props.text} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  skeleton: { padding: space.s5, gap: space.s3 },
});
