import { supabase } from '../../core/config/supabase';
import { DatabaseProvider, ListResult, QueryResult } from './DatabaseProvider';

const normalizeError = (error: any): QueryResult<never>['error'] => {
  if (!error) return null;
  return {
    code: error.code,
    message: error.message || 'Database request failed',
  };
};

export class SupabaseDatabaseProvider implements DatabaseProvider {
  async getActiveFestival<T>(tenantId: string): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('festival_calendar')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .single();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async getPointsConfig<T>(festivalId: string): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('points_config')
      .select('*')
      .eq('festival_id', festivalId)
      .single();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async upsertPointsConfig<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('points_config')
      .upsert(payload)
      .select()
      .single();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async upsertFestival<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('festival_calendar')
      .upsert(payload)
      .select()
      .single();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async getActiveItemCodes(festivalId: string): Promise<ListResult<{ item_code: string }>> {
    const { data, error } = await supabase
      .from('items')
      .select('item_code')
      .eq('festival_id', festivalId)
      .eq('is_active', true);

    return {
      data: data ?? [],
      error: normalizeError(error),
    };
  }

  async getItems<T>(festivalId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('festival_id', festivalId)
      .eq('is_active', true);
      
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async setActiveItemCodes(
    festivalId: string,
    tenantId: string,
    itemCodes: string[],
    itemRecords?: {
      item_code: string;
      item_name_ml: string;
      participation_type: string;
      category_codes: string[];
      duration_minutes?: number;
    }[],
  ): Promise<QueryResult<void>> {
    // 1. Fetch existing items
    const { data: existingItems, error: fetchErr } = await supabase
      .from('items')
      .select('id, item_code')
      .eq('festival_id', festivalId);

    if (fetchErr) {
      return { data: null, error: normalizeError(fetchErr) };
    }

    const existingCodes = new Set((existingItems || []).map((i) => i.item_code));

    // 2. Identify items to insert (new codes)
    const codesToInsert = itemCodes.filter((code) => !existingCodes.has(code));
    
    // 3. Update existing items sequentially to avoid sparse upsert issues
    const updatePromises = (existingItems || []).map(async (item) => {
      const isSelected = itemCodes.includes(item.item_code);
      const record = itemRecords?.find((r) => r.item_code === item.item_code);
      
      const updates: any = {
        is_active: isSelected,
      };

      if (record) {
        updates.item_name_ml = record.item_name_ml;
        updates.item_name_en = record.item_name_ml;
        updates.participation_type = record.participation_type;
        updates.category_codes = record.category_codes;
      }

      return supabase.from('items').update(updates).eq('id', item.id);
    });

    if (updatePromises.length > 0) {
      const results = await Promise.all(updatePromises);
      const firstError = results.find(r => r.error)?.error;
      if (firstError) {
        return { data: null, error: normalizeError(firstError) };
      }
    }

    // 4. Insert new items
    if (codesToInsert.length > 0) {
      const insertData = codesToInsert.map((code) => {
        const record = itemRecords?.find((r) => r.item_code === code);
        return {
          festival_id: festivalId,
          tenant_id: tenantId,
          item_code: code,
          is_active: true,
          item_name_ml: record?.item_name_ml ?? code,
          item_name_en: record?.item_name_ml ?? code,
          participation_type: record?.participation_type ?? 'individual',
          category_codes: record?.category_codes ?? [],
          duration_minutes: record?.duration_minutes ?? null,
        };
      });

      const { error: insertErr } = await supabase.from('items').insert(insertData);
      if (insertErr) {
        return { data: null, error: normalizeError(insertErr) };
      }
    }

    return { data: undefined, error: null };
  }

  async listParticipants<T>(): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('participants')
      .select('*, organisations(id, name, org_type)')
      .order('created_at', { ascending: false });

    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async getParticipant<T>(participantId: string): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('participants')
      .select('*, organisations(id, name, org_type)')
      .eq('id', participantId)
      .single();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async getPublicCandidateProfile<T>(slug: string): Promise<QueryResult<T>> {
    const { data, error } = await supabase.rpc('get_public_candidate_profile', {
      p_slug: slug,
    });

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async getParticipantRegistrations<T>(participantId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('registrations')
      .select('*, items(*)')
      .eq('participant_id', participantId);
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async getRegistrationsByItem<T>(itemId: string, _tenantId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('registrations')
      .select('*, participants(*, organisations(id, name, org_type))')
      .eq('item_id', itemId);
      // RLS automatically handles hybrid tenant visibility
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async listRegistrationsByFestival<T>(festivalId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('registrations')
      .select('id, item_id, status, is_verified, code_letter')
      .eq('festival_id', festivalId);
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async updateRegistration<T>(registrationId: string, updates: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('registrations')
      .update(updates)
      .eq('id', registrationId)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async updateParticipant<T>(
    participantId: string,
    updates: Record<string, unknown>,
  ): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('participants')
      .update(updates)
      .eq('id', participantId)
      .select()
      .single();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async deleteParticipant(participantId: string): Promise<QueryResult<void>> {
    const { error } = await supabase.from('participants').delete().eq('id', participantId);
    return { data: undefined, error: normalizeError(error) };
  }

  async deleteParticipants(participantIds: string[]): Promise<QueryResult<void>> {
    const { error } = await supabase.from('participants').delete().in('id', participantIds);
    return { data: undefined, error: normalizeError(error) };
  }

  async updateParticipants(
    participantIds: string[],
    updates: Record<string, unknown>,
  ): Promise<QueryResult<void>> {
    const { error } = await supabase.from('participants').update(updates).in('id', participantIds);
    return { data: undefined, error: normalizeError(error) };
  }

  async countParticipantsByCategory(categoryCode: string): Promise<QueryResult<number>> {
    const { count, error } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('category_code', categoryCode);

    return { data: count ?? 0, error: normalizeError(error) };
  }

  async createParticipant<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('participants')
      .insert(payload)
      .select()
      .single();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async createParticipants<T>(payloads: Record<string, unknown>[]): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('participants')
      .insert(payloads)
      .select();

    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async createRegistration<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('registrations')
      .insert(payload)
      .select()
      .single();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async listParticipantDuplicateKeys(
    tenantId: string,
  ): Promise<ListResult<{ name: string | null; dob: string | null }>> {
    const { data, error } = await supabase
      .from('participants')
      .select('name, dob')
      .eq('tenant_id', tenantId);

    return { data: data ?? [], error: normalizeError(error) };
  }

  async getTenantOrgType(tenantId: string): Promise<QueryResult<{ org_type: string | null }>> {
    const { data, error } = await supabase
      .from('tenants')
      .select('org_type')
      .eq('id', tenantId)
      .maybeSingle();

    return { data: data ?? null, error: normalizeError(error) };
  }

  async listOrganisations<T>(tenantId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .rpc('get_visible_organisations', { p_tenant_id: tenantId });

    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async getAdminDashboardStats(tenantId: string): Promise<QueryResult<{
    orgName: string;
    orgType: string;
    participantsCount: number;
    itemsCount: number;
    pendingRegsCount: number;
    categoryGraph: { name: string; count: number }[];
    unitGraph: { name: string; count: number }[];
  }>> {
    try {
      const { data: org, error: orgErr } = await supabase
        .from('organisations')
        .select('name, org_type')
        .eq('tenant_id', tenantId)
        .single();

      if (orgErr) throw orgErr;

      // Fetch active festival for the tenant
      const { data: activeFest } = await supabase
        .from('festival_calendar')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .maybeSingle();

      const isHighLevel = org?.org_type === 'sector' || org?.org_type === 'division';

      let pQuery = supabase.from('participants').select('id', { count: 'exact', head: true });
      let iQuery = supabase.from('items').select('id', { count: 'exact', head: true }).eq('is_active', true);
      let rQuery = supabase.from('registrations').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      let partsQuery = supabase.from('participants').select('category_code, organisations(name)');

      if (isHighLevel && activeFest?.id) {
        pQuery = pQuery.eq('festival_id', activeFest.id);
        iQuery = iQuery.eq('festival_id', activeFest.id);
        rQuery = rQuery.eq('festival_id', activeFest.id);
        partsQuery = partsQuery.eq('festival_id', activeFest.id);
      } else {
        pQuery = pQuery.eq('tenant_id', tenantId);
        iQuery = iQuery.eq('tenant_id', tenantId);
        rQuery = rQuery.eq('tenant_id', tenantId);
        partsQuery = partsQuery.eq('tenant_id', tenantId);
      }

      const [pCount, iCount, rCount, allParts] = await Promise.all([
        pQuery,
        iQuery,
        rQuery,
        partsQuery
      ]);

      const partsData = allParts.data || [];
      const catCountMap: Record<string, number> = {};
      const unitCountMap: Record<string, number> = {};

      partsData.forEach((p: any) => {
        const cat = p.category_code || 'Unknown';
        const unit = p.organisations?.name || 'Unknown';
        catCountMap[cat] = (catCountMap[cat] || 0) + 1;
        unitCountMap[unit] = (unitCountMap[unit] || 0) + 1;
      });

      const categoryGraph = Object.keys(catCountMap).map(k => ({ name: k, count: catCountMap[k] }));
      const unitGraph = Object.keys(unitCountMap).map(k => ({ name: k, count: unitCountMap[k] })).sort((a,b) => b.count - a.count);

      return {
        data: {
          orgName: org?.name || 'Unknown',
          orgType: org?.org_type || 'Unknown',
          participantsCount: pCount.count || 0,
          itemsCount: iCount.count || 0,
          pendingRegsCount: rCount.count || 0,
          categoryGraph,
          unitGraph
        },
        error: null
      };
    } catch (err: any) {
      return { data: null, error: normalizeError(err) };
    }
  }

  // --- Schedule & Venue Methods ---
  async listVenues<T>(tenantId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('venues')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name');
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async createVenue<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('venues')
      .insert(payload)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async updateVenue<T>(id: string, payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('venues')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async deleteVenue(id: string): Promise<QueryResult<void>> {
    const { error } = await supabase
      .from('venues')
      .delete()
      .eq('id', id);
    return { data: null, error: normalizeError(error) };
  }

  async listSchedules<T>(tenantId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('schedules')
      .select('*, venues(*), items(*)')
      .eq('tenant_id', tenantId)
      .order('start_time');
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async createSchedule<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('schedules')
      .insert(payload)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async updateSchedule<T>(id: string, payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('schedules')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async deleteSchedule(id: string): Promise<QueryResult<void>> {
    const { error } = await supabase
      .from('schedules')
      .delete()
      .eq('id', id);
    return { data: null, error: normalizeError(error) };
  }

  // --- Code Letter Management ---
  async getParticipantConflicts(participantIds: string[], currentScheduleId: string): Promise<QueryResult<Record<string, Set<string>>>> {
    try {
      if (!participantIds.length) return { data: {}, error: null };

      // 1. Fetch current schedule to get its time
      const { data: currentSchedule, error: err1 } = await supabase
        .from('schedules')
        .select('start_time, end_time')
        .eq('id', currentScheduleId)
        .single();
      
      if (err1) throw err1;
      if (!currentSchedule || !currentSchedule.start_time || !currentSchedule.end_time) {
        // If the current event is not scheduled with time, it can't overlap
        return { data: {}, error: null };
      }

      // 2. Fetch all OTHER registrations for these participants that HAVE a code letter assigned
      const { data: otherRegs, error: err2 } = await supabase
        .from('registrations')
        .select('participant_id, code_letter, item_id')
        .in('participant_id', participantIds)
        .not('code_letter', 'is', null);

      if (err2) throw err2;

      const itemIds = Array.from(new Set((otherRegs || []).map(r => r.item_id)));
      if (!itemIds.length) return { data: {}, error: null };

      // 3. Fetch schedules for these items
      const { data: schedules, error: err3 } = await supabase
        .from('schedules')
        .select('id, item_id, start_time, end_time')
        .in('item_id', itemIds);

      if (err3) throw err3;

      const conflicts: Record<string, Set<string>> = {};
      participantIds.forEach(id => { conflicts[id] = new Set<string>(); });

      const cStart = new Date(currentSchedule.start_time).getTime();
      const cEnd = new Date(currentSchedule.end_time).getTime();

      const itemSchedulesMap: Record<string, any[]> = {};
      (schedules || []).forEach(s => {
        if (!itemSchedulesMap[s.item_id]) itemSchedulesMap[s.item_id] = [];
        itemSchedulesMap[s.item_id].push(s);
      });

      for (const reg of otherRegs || []) {
        const scheds = itemSchedulesMap[reg.item_id] || [];
        for (const s of scheds) {
          if (s.id === currentScheduleId) continue;
          if (!s.start_time || !s.end_time) continue;

          const oStart = new Date(s.start_time).getTime();
          const oEnd = new Date(s.end_time).getTime();

          // Check overlap: oStart < cEnd && oEnd > cStart
          if (oStart < cEnd && oEnd > cStart) {
            conflicts[reg.participant_id].add(reg.code_letter);
            break;
          }
        }
      }

      return { data: conflicts, error: null };
    } catch (error: any) {
      return { data: null, error: normalizeError(error) };
    }
  }

  async updateCodeLetter(registrationId: string, codeLetter: string): Promise<QueryResult<void>> {
    const { error } = await supabase
      .from('registrations')
      .update({ code_letter: codeLetter })
      .eq('id', registrationId);
    return { data: null, error: normalizeError(error) };
  }

  // --- Leaderboard Settings & Poster Template Methods ---
  async getLeaderboardSettings<T>(festivalId: string): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('festival_leaderboard_settings')
      .select('*')
      .eq('festival_id', festivalId)
      .maybeSingle();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async upsertLeaderboardSettings<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('festival_leaderboard_settings')
      .upsert(payload, { onConflict: 'tenant_id,festival_id' })
      .select()
      .single();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async getPosterTemplates<T>(festivalId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('poster_templates')
      .select('*')
      .eq('festival_id', festivalId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async upsertPosterTemplate<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('poster_templates')
      .upsert(payload)
      .select()
      .single();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async deletePosterTemplate(templateId: string): Promise<QueryResult<void>> {
    const { error } = await supabase
      .from('poster_templates')
      .delete()
      .eq('id', templateId);

    return { data: null, error: normalizeError(error) };
  }

  async saveGeneratedPoster<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('generated_posters')
      .insert([payload])
      .select()
      .single();

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  // --- Super Admin Methods ---
  
  async getSuperAdminStats(): Promise<QueryResult<{ orgs: number; tenants: number }>> {
    const [orgsRes, tenantsRes] = await Promise.all([
      supabase.from('organisations').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('tenant_id', { count: 'exact', head: true }).not('tenant_id', 'is', null),
    ]);
    
    return {
      data: {
        orgs: orgsRes.count ?? 0,
        tenants: tenantsRes.count ?? 0,
      },
      error: normalizeError(orgsRes.error || tenantsRes.error)
    };
  }

  async listGlobalOrganisations<T>(): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('organisations')
      .select('*')
      .order('org_type')
      .order('name');
      
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async createGlobalOrganisation<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('organisations')
      .insert(payload)
      .select()
      .single();
      
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async deleteGlobalOrganisation(id: string): Promise<QueryResult<void>> {
    const { error } = await supabase.from('organisations').delete().eq('id', id);
    return { data: undefined, error: normalizeError(error) };
  }

  async listTenantAccounts<T>(): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('organisations')
      .select('id, name, org_type, tenant_id, admin_email, admin_password_temp')
      .order('created_at', { ascending: false });
      
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async revokeTenantAccess(orgId: string): Promise<QueryResult<void>> {
    const { data, error } = await supabase.rpc('revoke_tenant_access', { p_org_id: orgId });
    if (error || (data && !data.success)) {
      return { data: undefined, error: normalizeError(error || new Error(data?.error || 'Failed to revoke access')) };
    }
    return { data: undefined, error: null };
  }

  async setupTenantRecords(payload: Record<string, unknown>): Promise<QueryResult<void>> {
    const { data, error } = await supabase.rpc('setup_tenant_records', payload);
    if (error || (data && !data.success)) {
      return { data: undefined, error: normalizeError(error || new Error(data?.error || 'Failed to setup tenant')) };
    }
    return { data: undefined, error: null };
  }

  // ─── Judge Methods ───────────────────────────────────────────────────────────

  async listJudges<T>(tenantId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('judges')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name');
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async createJudge<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('judges')
      .insert(payload)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async updateJudge<T>(id: string, payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('judges')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async deleteJudge(id: string): Promise<QueryResult<void>> {
    const { error } = await supabase.from('judges').delete().eq('id', id);
    return { data: undefined, error: normalizeError(error) };
  }

  async assignJudgesToSchedule(scheduleId: string, judgeIds: string[]): Promise<QueryResult<void>> {
    // Store judge_panel_id as a JSON array in schedules table
    const { error } = await supabase
      .from('schedules')
      .update({ judge_panel_id: judgeIds as any })
      .eq('id', scheduleId);
    return { data: undefined, error: normalizeError(error) };
  }

  async getScheduleJudges<T>(scheduleId: string): Promise<ListResult<T>> {
    // Get judge_panel_id from schedule, then fetch those judges
    const { data: scheduleData, error: scheduleError } = await supabase
      .from('schedules')
      .select('judge_panel_id')
      .eq('id', scheduleId)
      .single();

    if (scheduleError || !scheduleData?.judge_panel_id) {
      return { data: [], error: normalizeError(scheduleError) };
    }

    const judgeIds = Array.isArray(scheduleData.judge_panel_id)
      ? scheduleData.judge_panel_id
      : [scheduleData.judge_panel_id];

    const { data, error } = await supabase
      .from('judges')
      .select('*')
      .in('id', judgeIds);

    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  // ─── Mark Entry Methods ───────────────────────────────────────────────────────

  async getRegistrationsBySchedule<T>(scheduleId: string): Promise<ListResult<T>> {
    // Use RPC function (SECURITY DEFINER) to bypass RLS.
    // Judge portal is accessed by unauthenticated (anon) users.
    // Direct table queries fail because schedules/registrations/participants have authenticated-only RLS.
    const { data, error } = await supabase.rpc('get_judge_registrations', {
      p_schedule_id: scheduleId,
    });

    if (error) {
      console.error('[getRegistrationsBySchedule] RPC error:', error);
      return { data: [], error: normalizeError(error) };
    }

    const mapped = ((data as any[]) ?? []).map((row) => ({
      id: row.id,
      item_id: row.item_id,
      tenant_id: row.tenant_id,
      code_letter: row.code_letter,
      participants: {
        name: row.participant_name,
        chest_number: row.chest_number,
        photo_url: row.photo_url,
        category_code: row.category_code,
      },
    }));

    return { data: mapped as unknown as T[], error: null };
  }

  async listMarkEntries<T>(scheduleId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('mark_entries')
      .select('*, judges(name)')
      .eq('schedule_id', scheduleId);
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async upsertMarkEntry<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('mark_entries')
      .upsert(payload, { onConflict: 'schedule_id,judge_id,registration_id' })
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async finalizeMarkEntry(markEntryId: string): Promise<QueryResult<void>> {
    const { error } = await supabase
      .from('mark_entries')
      .update({ is_draft: false, is_final: true, submitted_at: new Date().toISOString() })
      .eq('id', markEntryId);
    return { data: undefined, error: normalizeError(error) };
  }

  // ─── Results Methods ───────────────────────────────────────────────────────────

  async listResults<T>(scheduleId: string): Promise<ListResult<T>> {
    const { data: scheduleData, error: scheduleError } = await supabase
      .from('schedules')
      .select('item_id')
      .eq('id', scheduleId)
      .single();

    if (scheduleError || !scheduleData) {
      return { data: [], error: normalizeError(scheduleError) };
    }

    const { data, error } = await supabase
      .from('results')
      .select('*')
      .eq('item_id', scheduleData.item_id);
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async publishResults(payloads: Record<string, unknown>[]): Promise<QueryResult<void>> {
    if (payloads.length === 0) return { data: undefined, error: null };
    
    // Upsert using (registration_id, item_id) to uniquely identify each result.
    // This prevents accidental duplicate rows while correctly handling:
    // - Multiple participants in the same group item (each has their own registration_id)
    // - Re-publishing an item (updates the existing row instead of creating a duplicate)
    const { error } = await supabase
      .from('results')
      .upsert(payloads, { onConflict: 'registration_id,item_id' });
      
    return { data: undefined, error: normalizeError(error) };
  }

  async listPublicLeaderboard<T>(
    tenantId?: string | null,
    festivalId?: string | null,
  ): Promise<ListResult<T>> {
    const { data, error } = await supabase.rpc('get_public_leaderboard', {
      p_tenant_id: tenantId ?? null,
      p_festival_id: festivalId ?? null,
    });

    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async listAdminLeaderboard<T>(
    tenantId?: string | null,
    festivalId?: string | null,
  ): Promise<ListResult<T>> {
    const { data, error } = await supabase.rpc('get_admin_leaderboard', {
      p_tenant_id: tenantId ?? null,
      p_festival_id: festivalId ?? null,
    });

    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async listPublicPublishedResults<T>(
    tenantId?: string | null,
    festivalId?: string | null,
    includeParticipantDetails = true,
  ): Promise<ListResult<T>> {
    const { data, error } = await supabase.rpc('get_public_published_results', {
      p_tenant_id: tenantId ?? null,
      p_festival_id: festivalId ?? null,
      p_include_participant_details: includeParticipantDetails,
    });

    if (error || !data) {
      return { data: [], error: normalizeError(error) };
    }

    // Fetch item_codes for these results
    const itemIds = Array.from(new Set(data.map((r: any) => r.item_id).filter(Boolean)));
    let itemCodeMap: Record<string, string> = {};
    if (itemIds.length > 0) {
      const { data: itemsData } = await supabase
        .from('items')
        .select('id, item_code')
        .in('id', itemIds);
      if (itemsData) {
        itemsData.forEach((itm) => {
          itemCodeMap[itm.id] = itm.item_code;
        });
      }
    }

    const mappedData = data.map((row: any) => ({
      ...row,
      item_code: itemCodeMap[row.item_id] || '',
    }));

    return { data: (mappedData as T[]) ?? [], error: null };
  }

  async getPublicLeaderboardSettings<T>(
    tenantId?: string | null,
    festivalId?: string | null,
  ): Promise<QueryResult<T>> {
    const { data, error } = await supabase.rpc('get_public_leaderboard_settings', {
      p_tenant_id: tenantId ?? null,
      p_festival_id: festivalId ?? null,
    });

    return { data: ((data as T[]) ?? [])[0] ?? null, error: normalizeError(error) };
  }

  // ─── Result Visibility Management ────────────────────────────────────────────

  async listFestivalResults<T>(
    tenantId?: string | null,
    festivalId?: string | null,
  ): Promise<ListResult<T>> {
    return this.listAdminPublishedResults<T>(tenantId, festivalId);
  }

  async listAdminPublishedResults<T>(
    tenantId?: string | null,
    festivalId?: string | null,
  ): Promise<ListResult<T>> {
    const { data, error } = await supabase.rpc('get_admin_published_results', {
      p_tenant_id: tenantId ?? null,
      p_festival_id: festivalId ?? null,
    });
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async updateResultVisibility(
    resultId: string,
    status: 'draft' | 'ready' | 'published' | 'hidden' | 'archived',
  ): Promise<QueryResult<void>> {
    const updatePayload: Record<string, unknown> = {};
    if (status === 'published') {
      updatePayload.result_status = 'published';
      updatePayload.published = true;
      updatePayload.published_at = new Date().toISOString();
      updatePayload.public_visible = true;
    }
    if (status === 'hidden') {
      updatePayload.public_visible = false;
    }
    if (status === 'archived') {
      updatePayload.result_status = 'archived';
      updatePayload.published = false;
      updatePayload.published_at = null;
      updatePayload.public_visible = false;
    }
    if (status === 'draft' || status === 'ready') {
      updatePayload.result_status = status;
      updatePayload.public_visible = false;
      updatePayload.published = false;
      updatePayload.published_at = null;
    }

    const { error } = await supabase
      .from('results')
      .update(updatePayload)
      .eq('id', resultId);
    return { data: undefined, error: normalizeError(error) };
  }

  async bulkUpdateResultVisibility(
    resultIds: string[],
    status: 'draft' | 'ready' | 'published' | 'hidden' | 'archived',
  ): Promise<QueryResult<void>> {
    if (resultIds.length === 0) return { data: undefined, error: null };
    const updatePayload: Record<string, unknown> = {};
    if (status === 'published') {
      updatePayload.result_status = 'published';
      updatePayload.published = true;
      updatePayload.published_at = new Date().toISOString();
      updatePayload.public_visible = true;
    }
    if (status === 'hidden') {
      updatePayload.public_visible = false;
    }
    if (status === 'archived') {
      updatePayload.result_status = 'archived';
      updatePayload.published = false;
      updatePayload.published_at = null;
      updatePayload.public_visible = false;
    }
    if (status === 'draft' || status === 'ready') {
      updatePayload.result_status = status;
      updatePayload.public_visible = false;
      updatePayload.published = false;
      updatePayload.published_at = null;
    }

    const { error } = await supabase
      .from('results')
      .update(updatePayload)
      .in('id', resultIds);
    return { data: undefined, error: normalizeError(error) };
  }

  // ─── Judge Token Methods ──────────────────────────────────────────────────────


  async generateJudgeToken<T>(payload: {
    judgeId: string;
    scheduleId: string;
    tenantId: string;
    createdBy: string;
  }): Promise<QueryResult<T>> {
    // Use RPC function to bypass PostgREST schema cache issues
    const { data, error } = await supabase.rpc('generate_judge_token', {
      p_tenant_id: payload.tenantId,
      p_judge_id: payload.judgeId,
      p_schedule_id: payload.scheduleId,
      p_created_by: payload.createdBy && payload.createdBy.length === 36 ? payload.createdBy : null,
    });

    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async validateJudgeToken<T>(token: string): Promise<QueryResult<T>> {
    // Use RPC function (SECURITY DEFINER) to bypass RLS.
    // Judge portal is accessed by unauthenticated (anon) users.
    // Direct table joins fail because schedules/judges/venues have authenticated-only RLS.
    const { data, error } = await supabase.rpc('validate_judge_token', {
      p_token: token.toUpperCase().trim(),
    });

    if (error) {
      console.error('[validateJudgeToken] RPC error:', error);
      return {
        data: null,
        error: { message: `DB Error: ${error.message}` },
      };
    }

    if (!data) {
      return {
        data: null,
        error: { message: 'Invalid or expired access code. Please contact the administrator.' },
      };
    }

    return { data: (data as T), error: null };
  }

  async expireJudgeToken(token: string): Promise<QueryResult<void>> {
    const { error } = await supabase
      .from('judge_tokens')
      .update({ is_used: true, used_at: new Date().toISOString() })
      .eq('token', token.toUpperCase().trim());
    return { data: undefined, error: normalizeError(error) };
  }

  async logJudgeActivity(payload: { judgeId: string; scheduleId: string; tenantId: string; actionType: string; actionDetails: Record<string, any> }): Promise<QueryResult<void>> {
    const { error } = await supabase.rpc('log_judge_activity', {
      p_judge_id: payload.judgeId,
      p_schedule_id: payload.scheduleId,
      p_tenant_id: payload.tenantId,
      p_action_type: payload.actionType,
      p_action_details: payload.actionDetails
    });
    return { data: undefined, error: normalizeError(error) };
  }



  async listJudgeTokens<T>(scheduleId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('judge_tokens')
      .select('*, judges(name)')
      .eq('schedule_id', scheduleId)
      .order('created_at', { ascending: false });

    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async getJudgeSubmissionSummary<T>(scheduleId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .rpc('get_judge_submission_summary', { p_schedule_id: scheduleId });
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async getScheduleReadiness<T>(scheduleId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .rpc('get_schedule_readiness', { p_schedule_id: scheduleId });
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async previewBulkUnitAssignment(participantIds: string[], targetUnitId: string, tenantId: string): Promise<ListResult<any>> {
    const { data, error } = await supabase
      .rpc('preview_bulk_unit_assignment', {
        p_participant_ids: participantIds,
        p_target_unit_id: targetUnitId,
        p_tenant_id: tenantId
      });
    return { data: data ?? [], error: normalizeError(error) };
  }

  async executeBulkUnitAssignment(
    participantIds: string[],
    expectedHashes: string[],
    targetUnitId: string,
    batchId: string,
    tenantId: string
  ): Promise<QueryResult<any>> {
    const { data, error } = await supabase
      .rpc('execute_bulk_unit_assignment', {
        p_participant_ids: participantIds,
        p_expected_hashes: expectedHashes,
        p_target_unit_id: targetUnitId,
        p_batch_id: batchId,
        p_tenant_id: tenantId
      });
    return { data: data ?? null, error: normalizeError(error) };
  }

  async rollbackUnitAssignment(batchId: string): Promise<QueryResult<any>> {
    const { data, error } = await supabase
      .rpc('rollback_unit_assignment', { p_batch_id: batchId });
    return { data: data ?? null, error: normalizeError(error) };
  }

  async listParticipantUnitAuditLogs<T>(): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('participant_unit_audit_logs')
      .select('*, participants(name, chest_number), old_unit:organisations!old_unit_id(name), new_unit:organisations!new_unit_id(name)')
      .order('changed_at', { ascending: false });
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async listParticipantUnitBatches<T>(tenantId: string): Promise<ListResult<T>> {
    const { data, error } = await supabase
      .from('participant_unit_batches')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('started_at', { ascending: false });
    return { data: (data as T[]) ?? [], error: normalizeError(error) };
  }

  async createParticipantUnitBatch<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('participant_unit_batches')
      .insert(payload)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async updateParticipantUnitBatch<T>(id: string, updates: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('participant_unit_batches')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async createSystemEvent<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('system_events')
      .insert(payload)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  // Junior Dataset Import
  async createImportSession<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('import_sessions')
      .insert(payload)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async updateImportSession<T>(id: string, updates: Record<string, unknown>): Promise<QueryResult<T>> {
    const { data, error } = await supabase
      .from('import_sessions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    return { data: (data as T) ?? null, error: normalizeError(error) };
  }

  async executeJuniorImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>> {
    const { data, error } = await supabase.rpc('execute_junior_import_chunk', {
      p_tenant_id: payload.tenant_id,
      p_festival_id: payload.festival_id,
      p_session_id: payload.session_id,
      p_participants: payload.participants
    });
    return { data, error: normalizeError(error) };
  }

  async executeSeniorImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>> {
    const { data, error } = await supabase.rpc('execute_senior_import_chunk', {
      p_tenant_id: payload.tenant_id,
      p_festival_id: payload.festival_id,
      p_session_id: payload.session_id,
      p_participants: payload.participants
    });
    return { data, error: normalizeError(error) };
  }

  async executeUpperPrimaryImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>> {
    const { data, error } = await supabase.rpc('execute_upper_primary_import_chunk', {
      p_tenant_id: payload.tenant_id,
      p_festival_id: payload.festival_id,
      p_session_id: payload.session_id,
      p_participants: payload.participants
    });
    return { data, error: normalizeError(error) };
  }

  async executeLpImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>> {
    const { data, error } = await supabase.rpc('execute_lp_import_chunk', {
      p_tenant_id: payload.tenant_id,
      p_festival_id: payload.festival_id,
      p_session_id: payload.session_id,
      p_participants: payload.participants
    });
    return { data, error: normalizeError(error) };
  }

  async executeHsImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>> {
    const { data, error } = await supabase.rpc('execute_hs_import_chunk', {
      p_tenant_id: payload.tenant_id,
      p_festival_id: payload.festival_id,
      p_session_id: payload.session_id,
      p_participants: payload.participants
    });
    return { data, error: normalizeError(error) };
  }

  async executeHssImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>> {
    const { data, error } = await supabase.rpc('execute_hss_import_chunk', {
      p_tenant_id: payload.tenant_id,
      p_festival_id: payload.festival_id,
      p_session_id: payload.session_id,
      p_participants: payload.participants
    });
    return { data, error: normalizeError(error) };
  }

  async executeGeneralImportChunk(payload: { tenant_id: string; festival_id: string; session_id: string | null; participants: any[] }): Promise<QueryResult<any>> {
    const { data, error } = await supabase.rpc('execute_general_import_chunk', {
      p_tenant_id: payload.tenant_id,
      p_festival_id: payload.festival_id,
      p_session_id: payload.session_id,
      p_participants: payload.participants
    });
    return { data, error: normalizeError(error) };
  }

  async executeScheduleImportChunk(payload: { tenant_id: string; festival_id: string; schedules: any[] }): Promise<QueryResult<any>> {
    const { data, error } = await supabase.rpc('execute_schedule_import_chunk', {
      p_tenant_id: payload.tenant_id,
      p_festival_id: payload.festival_id,
      p_schedules: payload.schedules
    });
    return { data, error: normalizeError(error) };
  }

  async validateChestNumbers(festivalId: string, chestNumbers: string[]): Promise<ListResult<{ chest_number: string; name: string }>> {
    const { data, error } = await supabase
      .from('participants')
      .select('chest_number, name')
      .eq('festival_id', festivalId)
      .in('chest_number', chestNumbers);
    return { data: data ?? [], error: normalizeError(error) };
  }
}
