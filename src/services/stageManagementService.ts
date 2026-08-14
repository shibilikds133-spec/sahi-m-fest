import { supabase } from '../core/config/supabase';

export type StageManagementContext = {
  tenant_id: string;
  festival_id: string;
  festival_name: string;
  festival_level: string | null;
};

export type StageScheduleRow = {
  id: string;
  tenant_id: string;
  festival_id: string;
  item_id: string;
  venue_id: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  is_shuffle_locked: boolean;
  shuffle_locked_at: string | null;
  item_code: string | null;
  item_name_en: string | null;
  item_name_ml: string | null;
  category_codes: string[] | null;
  venue_name: string | null;
};

export type StageVenueRow = {
  id: string;
  tenant_id: string;
  festival_id: string;
  name: string;
  location: string | null;
  capacity: number | null;
};

export type StageRegistrationRow = {
  id: string;
  item_id: string;
  participant_id: string;
  organisation_id: string | null;
  status: string | null;
  is_verified: boolean | null;
  code_letter: string | null;
  participant_name: string | null;
  participant_chest_number: string | null;
  participant_category_code: string | null;
  organisation_name: string | null;
  organisation_type: string | null;
};

const throwIfError = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

export const stageManagementService = {
  async getContext(): Promise<StageManagementContext | null> {
    const { data, error } = await supabase.rpc('get_stage_management_context');
    throwIfError(error);
    return ((data as StageManagementContext[] | null) ?? [])[0] ?? null;
  },

  async getSchedules(festivalId: string): Promise<StageScheduleRow[]> {
    const { data, error } = await supabase.rpc('get_stage_management_schedules', {
      p_festival_id: festivalId,
    });
    throwIfError(error);
    return (data as StageScheduleRow[] | null) ?? [];
  },

  async getVenues(festivalId: string): Promise<StageVenueRow[]> {
    const { data, error } = await supabase.rpc('get_stage_management_venues', {
      p_festival_id: festivalId,
    });
    throwIfError(error);
    return (data as StageVenueRow[] | null) ?? [];
  },

  async getRegistrations(options: { scheduleId?: string; festivalId?: string }): Promise<StageRegistrationRow[]> {
    const { data, error } = await supabase.rpc('get_stage_management_registrations', {
      p_schedule_id: options.scheduleId ?? null,
      p_festival_id: options.festivalId ?? null,
    });
    throwIfError(error);
    return (data as StageRegistrationRow[] | null) ?? [];
  },

  async updateRegistration(scheduleId: string, registrationId: string, action: 'verify' | 'unverify' | 'reject' | 'restore') {
    const { data, error } = await supabase.rpc('stage_update_registration', {
      p_schedule_id: scheduleId,
      p_registration_id: registrationId,
      p_action: action,
    });
    throwIfError(error);
    return data;
  },

  async updateCodeLetter(scheduleId: string, registrationId: string, codeLetter: string) {
    const { data, error } = await supabase.rpc('stage_update_code_letter', {
      p_schedule_id: scheduleId,
      p_registration_id: registrationId,
      p_code_letter: codeLetter,
    });
    throwIfError(error);
    return data;
  },

  async updateScheduleLock(scheduleId: string, locked: boolean) {
    const { data, error } = await supabase.rpc('stage_update_schedule_lock', {
      p_schedule_id: scheduleId,
      p_locked: locked,
    });
    throwIfError(error);
    return data;
  },
};
