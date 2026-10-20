import { supabase } from '../core/config/supabase';

export type GeneralTeamEntry = {
  id: string;
  entry_chest_number: string;
  organisation_id: string;
  organisation: { name: string } | null;
  item: { id: string; item_code: string; item_name_en: string } | null;
  members: { participant: { name: string; chest_number: string | null } | null }[];
};

export const generalEntryService = {
  async list(festivalId: string): Promise<GeneralTeamEntry[]> {
    const { data, error } = await supabase
      .from('registrations')
      .select('id, entry_chest_number, organisation_id, organisation:organisations(name), item:items(id, item_code, item_name_en), members:group_members(participant:participants(name, chest_number))')
      .eq('festival_id', festivalId)
      .eq('entry_kind', 'general_team')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as GeneralTeamEntry[];
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
};
