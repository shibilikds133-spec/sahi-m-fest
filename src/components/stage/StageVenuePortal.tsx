import React from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, LockKeyhole, MapPin, RefreshCw } from 'lucide-react-native';
import { stageManagementService, StageRegistrationRow, StageScheduleRow } from '@/services/stageManagementService';

type PortalRegistration = StageRegistrationRow & {
  entry_kind?: string;
  members?: { name: string; chest_number: string | null }[];
};

const message = (title: string, body: string) => {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${body}`);
  else Alert.alert(title, body);
};

export default function StageVenuePortal({ venueId }: { venueId: string }) {
  const queryClient = useQueryClient();
  const [pinInput, setPinInput] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<'checkin' | 'codes'>('checkin');
  const [search, setSearch] = React.useState('');
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [letters, setLetters] = React.useState<Record<string, string>>({});

  const venueQuery = useQuery({
    queryKey: ['stage-venue-portal', venueId, pin],
    queryFn: () => stageManagementService.getVenuePortalData(venueId, pin),
    enabled: !!pin,
    retry: false,
    staleTime: 0,
  });
  const schedules = venueQuery.data?.schedules ?? [];
  const registrations = venueQuery.data?.registrations ?? [];

  const submitPin = async () => {
    if (!/^\d{4}$/.test(pinInput)) {
      message('PIN required', 'Enter the four-digit PIN provided by the administrator.');
      return;
    }
    setPin(pinInput);
    setPinInput('');
  };

  const runMutation = async (id: string, operation: () => Promise<unknown>, successText: string) => {
    setBusyId(id);
    try {
      await operation();
      await venueQuery.refetch();
      message('Updated', successText);
    } catch (error: any) {
      message('Unable to update', error?.message || 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const drawCodeLetters = async (schedule: StageScheduleRow, entries: PortalRegistration[]) => {
    const overwrite = entries.some((entry) => !!entry.code_letter);
    if (overwrite) {
      const confirmed = Platform.OS === 'web'
        ? window.confirm('Some code letters already exist. Draw again and replace them?')
        : true;
      if (!confirmed) return;
    }
    await runMutation(`draw-${schedule.id}`, () => stageManagementService.venuePortalDrawLetters(venueId, pin, schedule.id, overwrite), 'Code letters were assigned.');
  };

  if (!pin) {
    return (
      <View className="flex-1 bg-[#F6F7F9] items-center justify-center px-5 py-8">
        <View className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <View className="h-12 w-12 items-center justify-center rounded-xl bg-teal-50 mb-4"><LockKeyhole size={23} color="#0F766E" /></View>
          <Text className="text-2xl font-poppins-black text-slate-900">Stage access</Text>
          <Text className="mt-1 font-poppins text-sm text-slate-500">Enter the four-digit PIN provided for this stage.</Text>
          <TextInput
            accessibilityLabel="Four-digit stage PIN"
            value={pinInput}
            onChangeText={(value) => setPinInput(value.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            placeholder="••••"
            onSubmitEditing={submitPin}
            className="mt-5 h-12 rounded-xl border border-slate-300 px-4 text-center text-2xl tracking-[10px] text-slate-900"
          />
          <TouchableOpacity onPress={submitPin} className="mt-3 h-11 items-center justify-center rounded-xl bg-teal-700">
            <Text className="font-poppins-bold text-sm text-white">Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (venueQuery.isLoading) return <View className="flex-1 items-center justify-center bg-[#F6F7F9]"><ActivityIndicator size="large" color="#0F766E" /></View>;
  if (venueQuery.isError) {
    return (
      <View className="flex-1 items-center justify-center bg-[#F6F7F9] px-5">
        <View className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6">
          <Text className="font-poppins-bold text-lg text-slate-900">Stage access was not granted</Text>
          <Text className="mt-2 font-poppins text-sm text-slate-600">{(venueQuery.error as Error).message}</Text>
          <TouchableOpacity onPress={() => { queryClient.removeQueries({ queryKey: ['stage-venue-portal', venueId, pin], exact: true }); setPin(''); setPinInput(''); }} className="mt-4 h-10 items-center justify-center rounded-lg bg-teal-700">
            <Text className="font-poppins-bold text-sm text-white">Try another PIN</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#F6F7F9]">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, maxWidth: 1120, width: '100%', alignSelf: 'center' }}>
        <View className="mb-5 flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-2xl font-poppins-black text-slate-900">{venueQuery.data?.venue.name || 'Stage'}</Text>
            <View className="mt-1 flex-row items-center"><MapPin size={14} color="#64748B" /><Text className="ml-1 font-poppins text-sm text-slate-500">{venueQuery.data?.venue.location || 'Stage workspace'}</Text></View>
          </View>
          <TouchableOpacity accessibilityLabel="Refresh stage data" onPress={() => venueQuery.refetch()} className="h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white"><RefreshCw size={16} color="#475569" /></TouchableOpacity>
        </View>

        <View className="mb-4 flex-row rounded-xl border border-slate-200 bg-white p-1">
          {(['checkin', 'codes'] as const).map((tab) => (
            <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} className={`flex-1 rounded-lg px-3 py-2.5 ${activeTab === tab ? 'bg-teal-700' : ''}`}>
              <Text className={`text-center font-poppins-bold text-sm ${activeTab === tab ? 'text-white' : 'text-slate-600'}`}>{tab === 'checkin' ? 'Check-in' : 'Code letters'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput value={search} onChangeText={setSearch} placeholder="Search event, participant, or chest number" className="mb-4 h-10 rounded-xl border border-slate-200 bg-white px-3 font-poppins text-sm text-slate-800" />

        {schedules.length === 0 ? <View className="rounded-xl border border-slate-200 bg-white p-6"><Text className="font-poppins text-slate-500">No events are assigned to this stage.</Text></View> : schedules.map((schedule) => {
          const eventRegs = registrations.filter((row) => row.schedule_id === schedule.id);
          const query = search.trim().toLocaleLowerCase();
          const matchesEvent = !query || [schedule.item_name_en, schedule.item_name_ml, schedule.item_code, ...(schedule.category_codes || [])].some((value) => String(value || '').toLocaleLowerCase().includes(query));
          const visibleRegs = eventRegs.filter((row) => !query || matchesEvent || [row.participant_name, row.participant_chest_number, row.organisation_name, ...(row.members || []).map((member) => member.name), ...(row.members || []).map((member) => member.chest_number)].some((value) => String(value || '').toLocaleLowerCase().includes(query)));
          if (!matchesEvent && visibleRegs.length === 0) return null;
          const activeRegs = eventRegs.filter((row) => row.status !== 'rejected');
          const verified = activeRegs.filter((row) => row.is_verified).length;
          const isLocked = schedule.is_shuffle_locked;
          const codeFilled = (id: string) => letters[id] ?? '';
          return (
            <View key={schedule.id} className="mb-3 rounded-xl border border-slate-200 bg-white p-4">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="font-poppins-bold text-base text-slate-900">{schedule.item_name_en || schedule.item_code}</Text>
                  <Text className="mt-1 font-poppins text-xs text-slate-500">{(schedule.category_codes || []).join(', ') || 'Event'} · {activeRegs.length} entries · {verified} checked in</Text>
                </View>
                {isLocked ? <View className="flex-row items-center rounded-full bg-amber-50 px-2.5 py-1"><LockKeyhole size={12} color="#B45309" /><Text className="ml-1 font-poppins-bold text-[11px] text-amber-800">Locked</Text></View> : null}
              </View>
              {schedule.registration_scope_ambiguous ? (
                <View className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <Text className="font-poppins-bold text-xs text-amber-900">Registration access paused for this event</Text>
                  <Text className="mt-1 font-poppins text-xs text-amber-800">This item is scheduled at multiple stages, but registrations are stored by item rather than stage. Ask an administrator to resolve the schedule so one stage cannot change another stage’s entries.</Text>
                </View>
              ) : null}
              {activeTab === 'codes' && !isLocked ? (
                <View className="mt-3 flex-row flex-wrap gap-2">
                  <TouchableOpacity onPress={() => drawCodeLetters(schedule, activeRegs.filter((row) => row.is_verified))} disabled={busyId === `draw-${schedule.id}` || !activeRegs.some((row) => row.is_verified)} className={`h-9 flex-row items-center justify-center rounded-lg bg-teal-700 px-3 ${busyId === `draw-${schedule.id}` || !activeRegs.some((row) => row.is_verified) ? 'opacity-50' : ''}`}>
                    <RefreshCw size={13} color="white" /><Text className="ml-1.5 font-poppins-bold text-xs text-white">Draw letters</Text>
                  </TouchableOpacity>
                  {activeRegs.length > 0 && activeRegs.every((row) => !!row.code_letter) ? (
                    <TouchableOpacity onPress={() => {
                      const confirmLock = Platform.OS !== 'web' || window.confirm('Lock this event? Code letters and check-in changes will no longer be allowed.');
                      if (confirmLock) runMutation(`lock-${schedule.id}`, () => stageManagementService.venuePortalLockSchedule(venueId, pin, schedule.id), 'Event locked.');
                    }} disabled={!!busyId} className="h-9 flex-row items-center justify-center rounded-lg border border-amber-300 bg-amber-50 px-3"><LockKeyhole size={13} color="#92400E" /><Text className="ml-1.5 font-poppins-bold text-xs text-amber-900">Lock event</Text></TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
              {visibleRegs.length ? visibleRegs.map((entry) => {
                const isRejected = entry.status === 'rejected';
                const saving = busyId === entry.id;
                return (
                  <View key={entry.id} className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <View className="flex-row items-center justify-between gap-3">
                      <View className="flex-1">
                        <Text className="font-poppins-bold text-sm text-slate-900">{entry.participant_name || 'Entry'}</Text>
                        <Text className="font-poppins text-xs text-slate-500">{entry.participant_chest_number || '—'} · {entry.organisation_name || '—'}{entry.entry_kind === 'general_team' ? ' · Team' : ''}</Text>
                        {!!entry.members?.length && <Text className="mt-1 font-poppins text-xs text-slate-500" numberOfLines={2}>{entry.members.map((member) => `${member.name}${member.chest_number ? ` (${member.chest_number})` : ''}`).join(', ')}</Text>}
                      </View>
                      {activeTab === 'codes' ? <Text className="font-poppins-black text-lg text-teal-700">{entry.code_letter || '—'}</Text> : <View className="flex-row items-center">{entry.is_verified ? <Check size={16} color="#047857" /> : null}<Text className="ml-1 font-poppins-bold text-xs text-slate-600">{isRejected ? 'Rejected' : entry.is_verified ? 'Checked in' : 'Pending'}</Text></View>}
                    </View>
                    {activeTab === 'checkin' && !isLocked ? (
                      <View className="mt-2 flex-row flex-wrap gap-2">
                        {isRejected ? <PortalAction label="Restore" disabled={saving} onPress={() => runMutation(entry.id, () => stageManagementService.venuePortalUpdateRegistration(venueId, pin, schedule.id, entry.id, 'restore'), 'Entry restored.')} /> : <>
                          <PortalAction label={entry.is_verified ? 'Undo check-in' : 'Check in'} disabled={saving} onPress={() => runMutation(entry.id, () => stageManagementService.venuePortalUpdateRegistration(venueId, pin, schedule.id, entry.id, entry.is_verified ? 'unverify' : 'verify'), entry.is_verified ? 'Check-in removed.' : 'Entry checked in.')} />
                          <PortalAction label="Reject" danger disabled={saving} onPress={() => {
                            const reject = () => runMutation(entry.id, () => stageManagementService.venuePortalUpdateRegistration(venueId, pin, schedule.id, entry.id, 'reject'), 'Entry rejected.');
                            if (Platform.OS === 'web') { if (window.confirm(`Reject ${entry.participant_name || 'this entry'}?`)) void reject(); }
                            else Alert.alert('Reject entry?', `Reject ${entry.participant_name || 'this entry'}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Reject', style: 'destructive', onPress: reject }]);
                          }} />
                        </>}
                      </View>
                    ) : null}
                    {activeTab === 'codes' && !isLocked && entry.is_verified && !isRejected ? (
                      <View className="mt-2 flex-row items-center gap-2">
                        <TextInput value={codeFilled(entry.id) || entry.code_letter || ''} onChangeText={(value) => setLetters((state) => ({ ...state, [entry.id]: value.slice(-1).toUpperCase().replace(/[^A-Z]/g, '') }))} maxLength={1} autoCapitalize="characters" placeholder="A-Z" className="h-9 w-14 rounded-lg border border-slate-300 bg-white text-center font-poppins-bold text-sm uppercase" />
                        <TouchableOpacity onPress={() => runMutation(entry.id, () => stageManagementService.venuePortalUpdateCodeLetter(venueId, pin, schedule.id, entry.id, codeFilled(entry.id) || entry.code_letter || ''), 'Code letter saved.')} disabled={saving || !(codeFilled(entry.id) || entry.code_letter)} className="h-9 rounded-lg bg-slate-800 px-3 items-center justify-center"><Text className="font-poppins-bold text-xs text-white">Save letter</Text></TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                );
              }) : <Text className="mt-3 font-poppins text-xs text-slate-500">No matching entries.</Text>}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function PortalAction({ label, onPress, disabled, danger }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return <TouchableOpacity onPress={onPress} disabled={disabled} className={`h-8 items-center justify-center rounded-lg border px-3 ${danger ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'} ${disabled ? 'opacity-50' : ''}`}><Text className={`font-poppins-bold text-xs ${danger ? 'text-red-700' : 'text-slate-700'}`}>{label}</Text></TouchableOpacity>;
}
