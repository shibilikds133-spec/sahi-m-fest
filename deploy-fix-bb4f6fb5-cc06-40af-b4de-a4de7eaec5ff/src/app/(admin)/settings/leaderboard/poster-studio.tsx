import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useFestival } from '../../../../core/hooks/useFestival';
import { useAuthStore } from '../../../../core/store/authStore';
import PosterStudio from '../../../../components/leaderboard/PosterStudio/index';

export default function PosterStudioScreen() {
  const { useActiveFestival } = useFestival();
  const { data: festival } = useActiveFestival();
  const { tenant_id } = useAuthStore();

  const tenantId = tenant_id || '';
  const festivalId = festival?.id || '';

  return (
    <View style={styles.root}>
      <PosterStudio festivalId={festivalId} tenantId={tenantId} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
