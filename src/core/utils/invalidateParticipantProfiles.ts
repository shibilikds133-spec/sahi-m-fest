import type { QueryClient } from '@tanstack/react-query';

// Refresh identity consumers only; never invalidate raw judge mark drafts.
const consumers = new Set([
  'participants', 'participant', 'publicCandidateProfile', 'participantRegistrations',
  'participantGeneralTeamResults', 'scheduleRegistrations', 'itemRegistrations',
  'festivalRegistrations', 'participantConflicts', 'stage-management-registrations',
  'stage-venue-portal', 'general-team-entries', 'chest-number-order',
  'public-published-results', 'festival-results', 'public-registrations',
  'admin-leaderboard', 'public-leaderboard', 'leaderboard-preview',
  'team-leader-programs',
]);
const scheduled = new WeakMap<QueryClient, Map<string, Promise<unknown>>>();

export function invalidateParticipantProfiles(client: QueryClient, festivalId?: string) {
  let byFestival = scheduled.get(client);
  if (!byFestival) { byFestival = new Map(); scheduled.set(client, byFestival); }
  const key = festivalId ?? '*';
  const pending = byFestival.get(key);
  if (pending) return pending;
  // Several mounted identity consumers share one broadcast subscription. Merge
  // callbacks from the same hint without suppressing subsequent change events.
  const refresh = Promise.resolve().then(() => {
    byFestival.delete(key);
    return client.invalidateQueries({ predicate(query) {
      const [kind, second, third] = query.queryKey;
      if (!consumers.has(String(kind))) return false;
      if (!festivalId) return true;
      if (kind === 'general-team-entries' || kind === 'festivalRegistrations' || kind === 'team-leader-programs') return second === festivalId;
      if (kind === 'stage-management-registrations') return third === festivalId;
      if (['public-published-results', 'festival-results', 'admin-leaderboard', 'public-leaderboard', 'leaderboard-preview'].includes(String(kind))) {
        return !third || third === 'active' || third === 'all' || third === festivalId;
      }
      // Older identity keys omit festival; invalidate these rather than leave stale labels.
      return true;
    } });
  });
  byFestival.set(key, refresh);
  return refresh;
}
