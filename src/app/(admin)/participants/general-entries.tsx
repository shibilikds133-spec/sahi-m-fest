import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, Search, Users, X } from 'lucide-react-native';
import { SsfButton } from '../../../components/ui/SsfButton';
import { SsfCard } from '../../../components/ui/SsfCard';
import { useAuthStore } from '../../../core/store/authStore';
import { useFestival } from '../../../core/hooks/useFestival';
import { useParticipants } from '../../../core/hooks/useParticipants';
import { generalEntryService, type GeneralTeamEntry } from '../../../services/generalEntryService';
import { invalidateGeneralMembership } from '../../../core/utils/invalidateGeneralMembership';

type GeneralItem = {
  id: string;
  item_code: string;
  item_name_en: string;
  is_active?: boolean | null;
  category_codes?: string[] | null;
  participation_type?: string | null;
  group_min_members?: number | null;
  group_max_members?: number | null;
};

export default function GeneralEntriesScreen() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const { width, height } = useWindowDimensions();
  const queryClient = useQueryClient();
  const { role, is_superadmin } = useAuthStore();
  const { useActiveFestival, useItems } = useFestival();
  const { data: festival, isLoading: festivalLoading } = useActiveFestival();
  const { data: allItems = [], isLoading: itemsLoading } = useItems(festival?.id);
  const { participants, isLoadingList: participantsLoading } = useParticipants();
  const [itemId, setItemId] = useState('');
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [participantSearch, setParticipantSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [existingSearch, setExistingSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editIds, setEditIds] = useState<string[]>([]);
  const [editExpectedIds, setEditExpectedIds] = useState<string[]>([]);
  const [editSearch, setEditSearch] = useState('');
  const [editError, setEditError] = useState('');
  const [editNotice, setEditNotice] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const openedFromRoute = useRef<string | null>(null);

  const entriesQuery = useQuery({
    queryKey: ['general-team-entries', festival?.id],
    queryFn: () => generalEntryService.list(festival!.id),
    enabled: !!festival?.id && festival?.general_category_enabled === true,
  });

  const generalItems = useMemo(() => (allItems as GeneralItem[]).filter(item => {
    const categories = (item.category_codes ?? []).map(code => code.trim().toUpperCase());
    return item.is_active === true && categories.length === 1 && ['GN', 'GENERAL'].includes(categories[0])
      && item.participation_type?.toLowerCase() === 'group';
  }), [allItems]);
  const selectedItem = generalItems.find(item => item.id === itemId) ?? null;
  const festivalParticipants = useMemo(() => (participants as any[]).filter(p =>
    p.festival_id === festival?.id && p.id && p.organisation_id && p.status !== 'rejected'
      && (p.category_code ?? '').toUpperCase() !== 'GN' && (p.category_code ?? '').toUpperCase() !== 'GENERAL'
  ), [participants, festival?.id]);
  const selectedParticipants = festivalParticipants.filter(p => participantIds.includes(p.id));
  const organisationIds = [...new Set(selectedParticipants.map(p => p.organisation_id))];
  const oneTeamSelected = selectedParticipants.length > 0 && organisationIds.length === 1;
  const minMembers = Number(selectedItem?.group_min_members ?? 0);
  const maxMembers = Number(selectedItem?.group_max_members ?? 0);
  const sizeValid = !!selectedItem && minMembers > 0 && selectedParticipants.length >= minMembers
    && (maxMembers <= 0 || selectedParticipants.length <= maxMembers);
  const canCreate = !!festival && !!selectedItem && oneTeamSelected && sizeValid && !saving;

  const filteredItems = generalItems.filter(item =>
    `${item.item_code} ${item.item_name_en}`.toLowerCase().includes(itemSearch.trim().toLowerCase()));
  const filteredParticipants = festivalParticipants.filter(p =>
    `${p.name ?? ''} ${p.chest_number ?? ''}`.toLowerCase().includes(participantSearch.trim().toLowerCase()));
  const visibleEntries = useMemo(() => {
    const term = existingSearch.trim().toLowerCase();
    if (!term) return entriesQuery.data ?? [];
    return (entriesQuery.data ?? []).filter(entry => [
      entry.entry_chest_number, entry.item?.item_code, entry.item?.item_name_en,
      entry.item?.item_name_ml, entry.organisation?.name,
      ...(entry.members ?? []).flatMap(member => [member.participant?.name, member.participant?.chest_number]),
    ].filter(Boolean).join(' ').toLowerCase().includes(term));
  }, [entriesQuery.data, existingSearch]);

  const openEdit = (entry: GeneralTeamEntry) => {
    const members = entry.members.map(member => member.participant_id);
    setEditingId(entry.id);
    setEditIds(members);
    setEditExpectedIds(members);
    setEditSearch('');
    setEditError('');
    setEditNotice('');
  };
  useEffect(() => {
    if (typeof edit !== 'string' || !entriesQuery.data || openedFromRoute.current === edit) return;
    const entry = entriesQuery.data.find(row => row.id === edit);
    if (entry) { openedFromRoute.current = edit; openEdit(entry); }
  }, [edit, entriesQuery.data]);

  const editingEntry = entriesQuery.data?.find(entry => entry.id === editingId) ?? null;
  const editMin = Number(editingEntry?.item?.group_min_members ?? 0);
  const editMax = Number(editingEntry?.item?.group_max_members ?? 0);
  const editEligible = festivalParticipants.filter(p => p.organisation_id === editingEntry?.organisation_id
    && (!editingEntry?.item?.gender || ['both', ''].includes(editingEntry.item.gender.toLowerCase())
      || String(p.gender ?? '').toLowerCase() === editingEntry.item.gender.toLowerCase()));
  const editChoices = [...editEligible, ...(editingEntry?.members ?? [])
    .filter(member => !editEligible.some(p => p.id === member.participant_id))
    .map(member => ({ id: member.participant_id, name: member.participant?.name ?? 'Unavailable participant',
      chest_number: member.participant?.chest_number ?? null, organisation_id: editingEntry?.organisation_id ?? '',
      organisations: editingEntry?.organisation ?? null }))]
    .sort((a, b) => Number(editIds.includes(b.id)) - Number(editIds.includes(a.id))
      || String(a.name).localeCompare(String(b.name)))
    .filter(p => `${p.name ?? ''} ${p.chest_number ?? ''}`.toLowerCase().includes(editSearch.trim().toLowerCase()));
  const editChanged = editIds.length !== editExpectedIds.length || editIds.some(id => !editExpectedIds.includes(id));
  const editValid = editMin > 0 && editIds.length >= editMin && (editMax <= 0 || editIds.length <= editMax)
    && editIds.every(id => editEligible.some(p => p.id === id));

  const saveEdit = async () => {
    if (!festival || !editingEntry || !editChanged || !editValid || editSaving) return;
    setEditSaving(true); setEditError('');
    try {
      await generalEntryService.updateRoster(editingEntry.id, editIds, editExpectedIds);
      const affected = [...new Set([...editExpectedIds, ...editIds])];
      await invalidateGeneralMembership(queryClient, festival.id, affected);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['scheduleRegistrations'] }),
        queryClient.invalidateQueries({ queryKey: ['entrySizes'] }),
        queryClient.invalidateQueries({ queryKey: ['itemRegistrations', editingEntry.item?.id] }),
        queryClient.invalidateQueries({ predicate: query => query.queryKey[0] === 'participantRegistrations'
          && typeof query.queryKey[1] === 'string' && affected.includes(query.queryKey[1]) }),
      ]);
      setEditNotice(`Entry ${editingEntry.entry_chest_number} roster updated.`);
      setEditingId(null);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Could not save this roster.');
    } finally { setEditSaving(false); }
  };

  const toggleParticipant = (id: string) => {
    setErrorMessage(''); setSuccessMessage('');
    setParticipantIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  };

  const createEntry = async () => {
    if (!festival || !selectedItem || !canCreate) return;
    setSaving(true); setErrorMessage(''); setSuccessMessage('');
    try {
      const result = await generalEntryService.create(festival.id, selectedItem.id, participantIds);
      setSuccessMessage(`Entry ${result.entry_chest_number} created for ${selectedParticipants.length} members.`);
      setParticipantIds([]); setItemId('');
      await invalidateGeneralMembership(queryClient, festival.id, participantIds);
      await queryClient.invalidateQueries({ queryKey: ['scheduleRegistrations'] });
      await queryClient.invalidateQueries({ queryKey: ['participantRegistrations'] });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not create the General entry.');
    } finally { setSaving(false); }
  };

  if (role !== 'admin' && !is_superadmin) return <View className="flex-1 p-5"><Text>Administrator access is required.</Text></View>;
  if (festivalLoading || itemsLoading || participantsLoading) return <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>;
  if (!festival) return <View className="flex-1 p-5"><Text className="font-poppins text-ui-text">Select or activate a festival before creating entries.</Text></View>;
  if (festival.general_category_enabled !== true) return <View className="flex-1 bg-ssf-bg p-4"><SsfCard>
    <Text className="font-poppins-bold text-ui-text">General category is disabled for this festival.</Text>
  </SsfCard></View>;

  return <><ScrollView className="flex-1 bg-ssf-bg p-4" contentContainerStyle={{ paddingBottom: 32 }}>
    <View className="mb-4 flex-row items-center gap-3">
      <TouchableOpacity onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-xl border border-ui-border bg-white" accessibilityRole="button" accessibilityLabel="Go back">
        <ArrowLeft size={18} color="#334155" />
      </TouchableOpacity>
    </View>

    <SsfCard>
      <Text className="mb-2 font-poppins-bold text-base text-ui-text">New team entry</Text>
      <Text className="mb-2 font-poppins-bold text-xs text-ui-text">General competition</Text>
      <View className="mb-2 h-10 flex-row items-center rounded-lg border border-ui-border bg-white px-3">
        <Search size={15} color="#64748B" /><TextInput value={itemSearch} onChangeText={setItemSearch} placeholder="Search General competitions" className="ml-2 flex-1 font-poppins text-sm outline-none" />
      </View>
      <View className="mb-4 max-h-44 gap-y-1">
        {filteredItems.length ? filteredItems.map(item => {
          const active = itemId === item.id;
          return <TouchableOpacity key={item.id} onPress={() => { setItemId(item.id); setErrorMessage(''); }} className={`rounded-lg border px-3 py-2 ${active ? 'border-emerald-500 bg-emerald-50' : 'border-ui-border bg-white'}`}>
            <Text className="font-poppins-bold text-sm text-ui-text">{item.item_name_en}</Text>
            <Text className="font-poppins text-xs text-ui-text-muted">{item.item_code} · configured group size {item.group_min_members ?? '—'}{item.group_max_members && item.group_max_members !== item.group_min_members ? `–${item.group_max_members}` : ''}</Text>
          </TouchableOpacity>;
        }) : <Text className="py-3 font-poppins text-xs text-ui-text-muted">No active General group competitions with configured member sizes.</Text>}
      </View>

      <View className="mb-2 flex-row items-center justify-between">
        <Text className="font-poppins-bold text-xs text-ui-text">Team roster (required)</Text>
        <Text className="font-poppins-bold text-xs text-emerald-700">{participantIds.length} selected{maxMembers > 0 ? ` / ${maxMembers} max` : ''}</Text>
      </View>
      <Text className="mb-2 font-poppins text-xs text-ui-text-muted">Choose participants from one team. Their participant chest numbers stay unchanged; this entry receives a separate number.</Text>
      <View className="mb-2 h-10 flex-row items-center rounded-lg border border-ui-border bg-white px-3">
        <Search size={15} color="#64748B" /><TextInput value={participantSearch} onChangeText={setParticipantSearch} placeholder="Search by child name or chest number" className="ml-2 flex-1 font-poppins text-sm outline-none" />
      </View>
      <View className="max-h-72 gap-y-1">
        {maxMembers > 0 && participantIds.length >= maxMembers && <Text className="mb-1 font-poppins text-xs text-amber-700">Maximum {maxMembers} members selected. Deselect someone to choose another.</Text>}
        {filteredParticipants.length ? filteredParticipants.map(p => {
          const active = participantIds.includes(p.id);
          const atMemberLimit = maxMembers > 0 && participantIds.length >= maxMembers && !active;
          return <TouchableOpacity key={p.id} disabled={atMemberLimit} onPress={() => toggleParticipant(p.id)} className={`flex-row items-center rounded-lg border px-3 py-2 ${atMemberLimit ? 'opacity-50' : ''} ${active ? 'border-emerald-500 bg-emerald-50' : 'border-ui-border bg-white'}`}>
            <View className={`mr-3 h-5 w-5 items-center justify-center rounded border ${active ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 bg-white'}`}>{active && <Check size={13} color="white" />}</View>
            <View className="flex-1"><Text className="font-poppins-bold text-sm text-ui-text">{p.name}</Text><Text className="font-poppins text-xs text-ui-text-muted">Chest #{p.chest_number ?? '—'} · {p.organisations?.name ?? 'Team not set'}</Text></View>
            <Users size={15} color="#64748B" />
          </TouchableOpacity>;
        }) : <Text className="py-3 font-poppins text-xs text-ui-text-muted">No eligible participants found in this festival.</Text>}
      </View>
      {participantIds.length > 0 && !oneTeamSelected && <Text className="mt-2 font-poppins text-xs text-red-700">All selected participants must belong to the same team.</Text>}
      {selectedItem && !sizeValid && <Text className="mt-2 font-poppins text-xs text-amber-700">Select the configured team size{minMembers > 0 ? ` (${minMembers}${maxMembers > minMembers ? `–${maxMembers}` : ''})` : ''} to continue.</Text>}
      {!!errorMessage && <Text className="mt-3 font-poppins text-xs text-red-700">{errorMessage}</Text>}
      {!!successMessage && <Text className="mt-3 font-poppins text-xs text-emerald-700">{successMessage}</Text>}
      <View className="mt-4 self-start"><SsfButton label={saving ? 'Creating…' : 'Create General Entry'} onPress={createEntry} disabled={!canCreate} /></View>
    </SsfCard>

    <View className="mt-5 flex-row items-center justify-between"><Text className="font-poppins-bold text-lg text-ui-text">Existing entries</Text>
      <Text className="font-poppins text-xs text-ui-text-muted">{visibleEntries.length}{existingSearch.trim() ? ` / ${entriesQuery.data?.length ?? 0}` : ''}</Text></View>
    <View className="mt-2 h-10 flex-row items-center rounded-lg border border-ui-border bg-white px-3">
      <Search size={15} color="#64748B" /><TextInput value={existingSearch} onChangeText={setExistingSearch}
        placeholder="Chest, name or program" accessibilityLabel="Search existing General entries by chest number, participant or program"
        className="ml-2 flex-1 font-poppins text-sm outline-none" />
    </View>
    {!!editNotice && <Text className="mt-2 font-poppins text-xs text-emerald-700">{editNotice}</Text>}
    {entriesQuery.isLoading ? <View className="p-5"><ActivityIndicator /></View>
      : entriesQuery.error ? <SsfCard><Text className="font-poppins text-xs text-red-700">{entriesQuery.error.message}</Text></SsfCard>
      : !entriesQuery.data?.length ? <SsfCard><Text className="font-poppins text-xs text-ui-text-muted">No General team entries yet.</Text></SsfCard>
      : !visibleEntries.length ? <SsfCard><Text className="font-poppins text-xs text-ui-text-muted">No entries match this search.</Text></SsfCard>
      : visibleEntries.map(entry => <SsfCard key={entry.id} className="mt-2">
        <View className="flex-row items-start justify-between gap-3"><View className="flex-1">
          <Text className="font-poppins-bold text-sm text-ui-text">{entry.item?.item_name_en ?? 'General competition'}</Text>
          <Text className="font-poppins text-xs text-ui-text-muted">{entry.organisation?.name ?? 'Team'} · {entry.members?.length ?? 0} members</Text>
        </View><Text className="font-poppins-bold text-sm text-emerald-700">{entry.entry_chest_number}</Text></View>
        <Text className="mt-2 font-poppins text-xs text-ui-text-muted">{(entry.members ?? []).map(m => m.participant?.name).filter(Boolean).join(', ') || 'Roster unavailable'}</Text>
        <TouchableOpacity onPress={() => openEdit(entry)} accessibilityRole="button" accessibilityLabel={`Edit members of entry ${entry.entry_chest_number}`}
          className="mt-3 self-start rounded-lg border border-ui-border bg-white px-3 py-2">
          <Text className="font-poppins-bold text-xs text-ui-text">Edit members</Text>
        </TouchableOpacity>
      </SsfCard>)}
  </ScrollView>
    <Modal visible={!!editingEntry} transparent animationType="fade" onRequestClose={() => !editSaving && setEditingId(null)}>
      <View className="flex-1 items-center justify-center bg-black/40 p-3">
        <Pressable className="absolute inset-0" onPress={() => !editSaving && setEditingId(null)} accessibilityRole="button" accessibilityLabel="Close roster editor" />
        <View style={{ width: Math.max(0, Math.min(width - 24, 760)), height: Math.max(0, Math.min(height - 24, Math.max(380, 290 + editChoices.length * 58))), backgroundColor: '#FFFFFF' }} className="rounded-2xl p-4">
          <View className="mb-3 flex-row items-start justify-between gap-3">
            <View className="flex-1"><Text className="font-poppins-black text-lg text-ui-text">Edit team members</Text>
              <Text className="font-poppins text-xs text-ui-text-muted">{editingEntry?.item?.item_name_en} · Entry #{editingEntry?.entry_chest_number}</Text></View>
            <TouchableOpacity onPress={() => !editSaving && setEditingId(null)} accessibilityLabel="Close roster editor" className="h-10 w-10 items-center justify-center"><X size={20} color="#475569" /></TouchableOpacity>
          </View>
          <Text className="mb-2 font-poppins text-xs text-ui-text-muted">Entry chest number, marks and results stay unchanged. Only the saved members will appear in this entry.</Text>
          <View className="mb-2 h-10 flex-row items-center rounded-lg border border-ui-border px-3">
            <Search size={15} color="#64748B" /><TextInput value={editSearch} onChangeText={setEditSearch}
              placeholder="Name or chest #" accessibilityLabel="Search eligible team members by name or chest number"
              className="ml-2 flex-1 font-poppins text-sm outline-none" />
          </View>
          <Text className="mb-2 font-poppins-bold text-xs text-ui-text">{editIds.length} selected · Required {editMin}{editMax > editMin ? `–${editMax}` : ''}</Text>
          <ScrollView className="min-h-0 flex-1" keyboardShouldPersistTaps="handled">
            {editChoices.map(person => {
              const selected = editIds.includes(person.id);
              const eligible = editEligible.some(p => p.id === person.id);
              const limitReached = editMax > 0 && editIds.length >= editMax && !selected;
              return <TouchableOpacity key={person.id} disabled={editSaving || limitReached || (!eligible && !selected)}
                onPress={() => { setEditIds(ids => selected ? ids.filter(id => id !== person.id) : [...ids, person.id]); setEditError(''); }}
                className={`mb-1 flex-row items-center rounded-lg border px-3 py-2 ${selected ? 'border-emerald-500 bg-emerald-50' : 'border-ui-border bg-white'} ${limitReached ? 'opacity-50' : ''}`}>
                <View className={`mr-3 h-5 w-5 items-center justify-center rounded border ${selected ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 bg-white'}`}>{selected && <Check size={13} color="white" />}</View>
                <View className="flex-1"><Text className="font-poppins-bold text-sm text-ui-text">{person.name}</Text>
                  <Text className="font-poppins text-xs text-ui-text-muted">Chest #{person.chest_number ?? '—'}{!eligible ? ' · no longer eligible' : ''}</Text></View>
              </TouchableOpacity>;
            })}
            {!editChoices.length && <Text className="py-4 font-poppins text-sm text-ui-text-muted">No team members match this search.</Text>}
          </ScrollView>
          {!editValid && <Text className="mt-2 font-poppins text-xs text-amber-700">Choose the configured team size using eligible members from this team.</Text>}
          {!!editError && <Text className="mt-2 font-poppins text-xs text-red-700">{editError}</Text>}
          <View className="mt-3 flex-row flex-wrap items-center gap-2">
            <View><SsfButton label={editSaving ? 'Saving…' : 'Save members'} onPress={saveEdit} disabled={!editChanged || !editValid || editSaving} /></View>
            <TouchableOpacity onPress={() => setEditingId(null)} disabled={editSaving} className="rounded-lg border border-ui-border px-4 py-2"><Text className="font-poppins-bold text-sm text-ui-text">Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  </>;
}
