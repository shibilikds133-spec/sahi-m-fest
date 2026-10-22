type CheckInEntry = {
  entry_kind?: string;
  participant_id?: string | null;
  group_leader_participant_id?: string | null;
  group_leader_profile_slug?: string | null;
  participants?: { id?: string | null; chest_number?: string | null };
};

// Group check-in is identified by its explicitly assigned leader. Legacy group
// numbers and other members' QR cards must not identify the group.
export function findParticipantQrEntry<T extends CheckInEntry>(entries: T[], qr: { chest?: string; pid?: string }): T | undefined {
  return entries.find(entry => entry.entry_kind === 'general_team'
    ? !!entry.group_leader_participant_id
      && ((!!qr.pid && (entry.group_leader_participant_id === qr.pid || entry.group_leader_profile_slug === qr.pid))
        || (!qr.pid && !!qr.chest && entry.participants?.chest_number === qr.chest))
    : !!(entry.participant_id || entry.participants?.id)
    && ((!!qr.chest && entry.participants?.chest_number === qr.chest)
      || (!!qr.pid && entry.participants?.id === qr.pid)));
}
