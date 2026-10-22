import { supabase } from '../core/config/supabase';
import { groupEntryChest } from '../core/utils/groupParticipation';

export type GeneralTeamEntry = {
  id: string;
  entry_chest_number: string;
  group_leader_participant_id: string | null;
  leader: { id: string; name: string; chest_number: string | null; profile_slug?: string | null } | null;
  organisation_id: string;
  organisation: { name: string } | null;
  item: { id: string; item_code: string; item_name_en: string; item_name_ml: string | null; category_codes: string[]; group_min_members: number | null; group_max_members: number | null; gender: string | null } | null;
  members: { participant_id: string; participant: { id: string; name: string; chest_number: string | null } | null }[];
};

export const generalEntryService = {
  async list(festivalId: string): Promise<GeneralTeamEntry[]> {
    const { data, error } = await supabase
      .from('registrations')
      .select('id, entry_chest_number, group_leader_participant_id, leader:participants!registrations_group_leader_participant_id_fkey(id, name, chest_number, profile_slug), organisation_id, organisation:organisations(name), item:items(id, item_code, item_name_en, item_name_ml, category_codes, group_min_members, group_max_members, gender), members:group_members(participant_id, participant:participants(id, name, chest_number))')
      .eq('festival_id', festivalId)
      .eq('entry_kind', 'general_team')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as GeneralTeamEntry[]).map(entry => ({ ...entry, entry_chest_number: groupEntryChest(entry) }));
  },

  async create(festivalId: string, itemId: string, participantIds: string[]) {
    const { data, error } = await supabase.rpc('create_general_team_entry', {
      p_festival_id: festivalId,
      p_item_id: itemId,
      p_participant_ids: participantIds,
    });
    if (error) throw new Error(error.message);
    return data as { registration_id: string; entry_chest_number: string; organisation_id: string; member_count: number };
  },

  async updateRoster(registrationId: string, participantIds: string[], expectedParticipantIds: string[], leaderId: string, expectedLeaderId: string | null) {
    const { data, error } = await supabase.rpc('update_group_team_roster', {
      p_registration_id: registrationId,
      p_participant_ids: participantIds,
      p_expected_participant_ids: expectedParticipantIds,
      p_leader_participant_id: leaderId,
      p_expected_leader_participant_id: expectedLeaderId,
    });
    if (error) throw new Error(error.message);
    return data as { registration_id: string; entry_chest_number: string; member_count: number; changed: boolean };
  },
};
