import React from 'react';
import { Stack } from 'expo-router';
import BackgroundExportEngine from '@/components/leaderboard/BackgroundExportEngine';

export default function AdminLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="participants/index" />
        <Stack.Screen name="participants/add" />
        <Stack.Screen name="participants/chest-cards" />
        <Stack.Screen name="participants/chest-numbers" />
        <Stack.Screen name="participants/import" />
        <Stack.Screen name="participants/manage-units" />
        <Stack.Screen name="participants/[id]/index" />
        <Stack.Screen name="schedule/index" />
        <Stack.Screen name="schedule/create" />
        <Stack.Screen name="schedule/venues" />
        <Stack.Screen name="schedule/[id]/checkin" />
        <Stack.Screen name="schedule/[id]/code-letter" />
        <Stack.Screen name="schedule/[id]/marks" />
        <Stack.Screen name="schedule/[id]/results" />
        <Stack.Screen name="judges/index" />
        <Stack.Screen name="organisations/index" />
        <Stack.Screen name="settings/leaderboard" />
        <Stack.Screen name="settings/index" />
        <Stack.Screen name="system/pages/index" />
      </Stack>
      <BackgroundExportEngine />
    </>
  );
}
