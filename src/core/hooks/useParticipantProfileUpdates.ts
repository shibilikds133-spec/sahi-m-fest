import { useQueryClient } from '@tanstack/react-query';
import { useRealtimeUpdates } from './useCodeLetterUpdates';
import { invalidateParticipantProfiles } from '../utils/invalidateParticipantProfiles';

export function useParticipantProfileUpdates(festivalId?: string | null) {
  const client = useQueryClient();
  useRealtimeUpdates(festivalId ? `participant-profiles:${festivalId}` : null,
    () => invalidateParticipantProfiles(client, festivalId ?? undefined));
}
