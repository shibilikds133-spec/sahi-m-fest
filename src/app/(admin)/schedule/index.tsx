import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, TextInput, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { AdminScheduleChatBot } from '../../../components/ui/AdminScheduleChatBot';
import { useSchedule } from '../../../core/hooks/useSchedule';
import { Calendar, MapPin, Plus, Clock, UserCheck, Edit, Trash2, Search, X } from 'lucide-react-native';
import { useJudges } from '../../../core/hooks/useJudges';
import { useParticipants } from '../../../core/hooks/useParticipants';
import { useFestival } from '../../../core/hooks/useFestival';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../../core/store/authStore';
import { supabase } from '../../../core/config/supabase';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ScheduleStatusBadge({ scheduleId }: { scheduleId: string }) {
  const { useJudgeSubmissionSummary } = useJudges();
  const { data: summary } = useJudgeSubmissionSummary(scheduleId);
  if (!summary || !(summary as any[]).length) return null;
  const rows = summary as any[];
  const totalSubmitted = rows.reduce((acc: number, j: any) => acc + Number(j.submitted_count), 0);
  const totalExpected = rows.reduce((acc: number, j: any) => acc + Number(j.total_assigned), 0);
  const allDone = rows.every((j: any) => Number(j.submitted_count) >= Number(j.total_assigned) && Number(j.total_assigned) > 0);
  return (
    <View className={`flex-row items-center gap-x-1 px-2 py-0.5 rounded-full mt-2 self-start ${
      allDone ? 'bg-green-100' : totalSubmitted > 0 ? 'bg-orange-100' : 'bg-gray-100'
    }`}>
      <Text className={`font-poppins text-xs ${
        allDone ? 'text-green-700' : totalSubmitted > 0 ? 'text-orange-700' : 'text-gray-500'
      }`}>
        {allDone ? `✅ Marks: All submitted` : `📝 Marks: ${totalSubmitted}/${totalExpected} submitted`}
      </Text>
    </View>
  );
}

function ScheduleWorkflowBadges({ scheduleId, registrations = [], isShuffleLocked }: { scheduleId: string; registrations?: any[]; isShuffleLocked?: boolean }) {
  const { useJudgeSubmissionSummary, useResults } = useJudges();
  const { data: summary } = useJudgeSubmissionSummary(scheduleId);
  const { data: results } = useResults(scheduleId);
  const resultRows = (results as any[]) ?? [];
  const hasInternalPublished = resultRows.some((row) =>
    row.published === true || row.result_status === 'published'
  );
  const hasManualSubmitted = resultRows.some((row) =>
    row.collection_method === 'manual' && (row.published === true || row.result_status === 'published')
  );

  const activeRegs = registrations.filter((r: any) => r.status !== 'rejected');
  const verifiedRegs = activeRegs.filter((r: any) => r.is_verified);
  
  const checkinDone = (activeRegs.length > 0 && activeRegs.every((r: any) => r.is_verified)) || isShuffleLocked;
  const checkinPending = activeRegs.length > 0 && activeRegs.some((r: any) => !r.is_verified) && !isShuffleLocked;
  
  const codesShuffled = (verifiedRegs.length > 0 && verifiedRegs.every((r: any) => r.code_letter !== null && r.code_letter !== undefined)) || isShuffleLocked;
  const codesPending = verifiedRegs.length > 0 && verifiedRegs.some((r: any) => r.code_letter === null || r.code_letter === undefined) && !isShuffleLocked;

  const rows = (summary as any[]) ?? [];
  const totalSubmitted = rows.reduce((acc: number, j: any) => acc + Number(j.submitted_count), 0);
  const totalExpected = rows.reduce((acc: number, j: any) => acc + Number(j.total_assigned), 0);
  const allDone = rows.length > 0 && rows.every((j: any) => Number(j.submitted_count) >= Number(j.total_assigned) && Number(j.total_assigned) > 0);

  const badges: { label: string; bg: string; text: string }[] = [];

  // Check-in status (Malayalam highlighted text as requested)
  if (checkinDone) {
    badges.push({ label: 'Check-in Kazhinju', bg: 'bg-green-100 border border-green-200', text: 'text-green-700' });
  } else if (checkinPending && !hasManualSubmitted && !hasInternalPublished && !allDone) {
    badges.push({ label: 'Check-in Pending', bg: 'bg-amber-100 border border-amber-200', text: 'text-amber-700' });
  }

  // Code Letter status
  if (codesShuffled) {
    badges.push({ label: 'Codes Shuffled', bg: 'bg-blue-100 border border-blue-200', text: 'text-blue-700' });
  } else if (codesPending && !hasManualSubmitted && !hasInternalPublished && !allDone) {
    badges.push({ label: 'Codes Pending', bg: 'bg-gray-100 border border-gray-200', text: 'text-gray-500' });
  }

  if (hasManualSubmitted) {
    badges.push({ label: 'Mark Submitted (Manual)', bg: 'bg-green-100 border border-green-200', text: 'text-green-700' });
  }
  if (hasInternalPublished) {
    badges.push({ label: 'Published to Admin Leaderboard', bg: 'bg-blue-100 border border-blue-200', text: 'text-blue-700' });
  }

  if (!badges.length && !rows.length) return null;

  return (
    <View className="flex-row flex-wrap gap-2 mt-2">
      {badges.map((badge) => (
        <View key={badge.label} className={`flex-row items-center gap-x-1 px-2 py-0.5 rounded-full self-start ${badge.bg}`}>
          <Text className={`font-poppins-bold text-[10px] ${badge.text}`}>{badge.label}</Text>
        </View>
      ))}
      {rows.length > 0 && (
        <View className={`flex-row items-center gap-x-1 px-2 py-0.5 rounded-full self-start border ${
          allDone ? 'bg-green-100 border-green-200' : totalSubmitted > 0 ? 'bg-orange-100 border-orange-200' : 'bg-gray-100 border-gray-200'
        }`}>
          <Text className={`font-poppins-bold text-[10px] ${
            allDone ? 'text-green-700' : totalSubmitted > 0 ? 'text-orange-700' : 'text-gray-500'
          }`}>
            {allDone ? 'Marks: All submitted' : `Marks: ${totalSubmitted}/${totalExpected} submitted`}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function ScheduleDashboard() {
  const router = useRouter();
  const { schedules, isLoadingSchedules, venues, isLoadingVenues, deleteSchedule } = useSchedule();
  const { useActiveFestival } = useFestival();
  const { data: festival, isLoading: isLoadingFest } = useActiveFestival();
  const { useFestivalRegistrations } = useParticipants();
  const { data: allRegistrations = [], isLoading: isLoadingRegs } = useFestivalRegistrations(festival?.id);
  const { judges } = useJudges();

  const { tenant_id } = useAuthStore();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState('All');
  const [selectedVenue, setSelectedVenue] = React.useState('All');
  const [selectedStatus, setSelectedStatus] = React.useState('All');

  const categoriesList = ['All', 'LP', 'UP', 'HS', 'HSS', 'JUNIOR', 'SENIOR', 'CAMPUS', 'GENERAL'];

  const venuesList = React.useMemo(() => {
    return [{ id: 'All', name: 'All Venues' }, ...venues.map((v: any) => ({ id: v.id, name: v.name }))];
  }, [venues]);

  const statusesList = [
    { id: 'All', name: 'All Statuses' },
    { id: 'checkin_pending', name: 'Check-in Pending' },
    { id: 'checkin_done', name: 'Check-in Completed' },
    { id: 'codes_pending', name: 'Codes Pending' },
    { id: 'codes_done', name: 'Codes Shuffled' },
    { id: 'marks_pending', name: 'Marks Pending' },
    { id: 'marks_done', name: 'Marks Submitted' },
    { id: 'published', name: 'Published to Admin Leaderboard' },
  ];

  // Fetch all results for the active festival to filter schedules by published status
  const { data: allResults = [] } = useQuery({
    queryKey: ['allFestivalResults', festival?.id],
    queryFn: async () => {
      if (!festival?.id) return [];
      const { data, error } = await supabase
        .from('results')
        .select('item_id, published, result_status')
        .eq('festival_id', festival.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!festival?.id,
  });

  // Fetch all mark entries to filter schedules by judge marks submission status
  const { data: allMarkEntries = [] } = useQuery({
    queryKey: ['allFestivalMarkEntries', tenant_id],
    queryFn: async () => {
      if (!tenant_id) return [];
      const { data, error } = await supabase
        .from('mark_entries')
        .select('schedule_id, judge_id, is_final')
        .eq('tenant_id', tenant_id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenant_id,
  });

  const filteredSchedules = React.useMemo(() => {
    return schedules.filter((schedule: any) => {
      // 1. Search Query Filter
      let matchesSearch = true;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchNameEn = schedule.items?.item_name_en?.toLowerCase().includes(query);
        const matchNameMl = schedule.items?.item_name_ml?.toLowerCase().includes(query);
        const matchCategory = schedule.items?.category_codes?.some((code: string) => 
          code.toLowerCase().includes(query)
        );
        matchesSearch = matchNameEn || matchNameMl || matchCategory;
      }
      
      // 2. Category Filter
      let matchesCategory = true;
      if (selectedCategory !== 'All') {
        const codes = Array.isArray(schedule.items?.category_codes) 
          ? schedule.items.category_codes 
          : (schedule.items?.category_codes ? [schedule.items.category_codes] : []);
        
        const catShort = selectedCategory === 'SENIOR' ? 'SR' : (selectedCategory === 'JUNIOR' ? 'JR' : (selectedCategory === 'CAMPUS' ? 'CA' : (selectedCategory === 'GENERAL' ? 'GN' : selectedCategory)));
        const catLong = selectedCategory === 'SR' ? 'SENIOR' : (selectedCategory === 'JR' ? 'JUNIOR' : (selectedCategory === 'CA' ? 'CAMPUS' : (selectedCategory === 'GN' ? 'GENERAL' : selectedCategory)));

        matchesCategory = codes.includes(selectedCategory) || codes.includes(catShort) || codes.includes(catLong);
      }
      
      // 3. Venue Filter
      let matchesVenue = true;
      if (selectedVenue !== 'All') {
        matchesVenue = schedule.venue_id === selectedVenue || schedule.venues?.id === selectedVenue;
      }

      // 4. Status/Workflow Filter
      let matchesStatus = true;
      if (selectedStatus !== 'All') {
        const scheduleRegs = allRegistrations.filter((r: any) => r.item_id === schedule.item_id && r.status !== 'rejected');
        const verifiedRegs = scheduleRegs.filter((r: any) => r.is_verified);
        
        const checkinDone = scheduleRegs.length > 0 && scheduleRegs.every((r: any) => r.is_verified);
        const checkinPending = scheduleRegs.length > 0 && scheduleRegs.some((r: any) => !r.is_verified);
        
        const codesShuffled = verifiedRegs.length > 0 && verifiedRegs.every((r: any) => r.code_letter !== null && r.code_letter !== undefined);
        const codesPending = verifiedRegs.length > 0 && verifiedRegs.some((r: any) => r.code_letter === null || r.code_letter === undefined);
        
        const isPublished = allResults.some((res: any) => 
          res.item_id === schedule.item_id && 
          (res.published === true || res.result_status === 'published')
        );
        
        const scheduleMarkEntries = allMarkEntries.filter((m: any) => m.schedule_id === schedule.id && m.is_final);
        const uniqueJudgesCount = new Set(scheduleMarkEntries.map((m: any) => m.judge_id)).size;
        const expectedJudges = Array.isArray(schedule.judge_panel_id)  
          ? Math.max(1, schedule.judge_panel_id.length) 
          : (schedule.expected_judge_count || 3);
        const marksSubmitted = (uniqueJudgesCount >= expectedJudges && expectedJudges > 0) || isPublished;

        if (selectedStatus === 'checkin_pending') {
          matchesStatus = checkinPending;
        } else if (selectedStatus === 'checkin_done') {
          matchesStatus = checkinDone;
        } else if (selectedStatus === 'codes_pending') {
          matchesStatus = codesPending;
        } else if (selectedStatus === 'codes_done') {
          matchesStatus = codesShuffled;
        } else if (selectedStatus === 'marks_pending') {
          matchesStatus = !marksSubmitted;
        } else if (selectedStatus === 'marks_done') {
          matchesStatus = marksSubmitted;
        } else if (selectedStatus === 'published') {
          matchesStatus = isPublished;
        }
      }
      
      return matchesSearch && matchesCategory && matchesVenue && matchesStatus;
    });
  }, [schedules, searchQuery, selectedCategory, selectedVenue, selectedStatus, allRegistrations, allResults, allMarkEntries]);

  const handleDelete = async (id: string, itemName: string) => {
    const confirmMsg = `Are you sure you want to delete the schedule for "${itemName}"? This action cannot be undone.`;
    if (Platform.OS === 'web') {
      if (!window.confirm(confirmMsg)) return;
    } else {
      let confirmed = false;
      await new Promise<void>((resolve) => {
        Alert.alert(
          'Delete Schedule',
          confirmMsg,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
            { 
              text: 'Delete', 
              style: 'destructive', 
              onPress: () => {
                confirmed = true;
                resolve();
              } 
            }
          ]
        );
      });
      if (!confirmed) return;
    }

    try {
      await deleteSchedule(id);
      if (Platform.OS === 'web') {
        window.alert('✅ Schedule deleted successfully!');
      } else {
        Alert.alert('Success', 'Schedule deleted successfully!');
      }
    } catch (err: any) {
      if (Platform.OS === 'web') {
        window.alert('❌ Error: ' + err.message);
      } else {
        Alert.alert('Error', err.message);
      }
    }
  };

  if (isLoadingSchedules || isLoadingVenues || isLoadingRegs || isLoadingFest) {
    return <ActivityIndicator color="#1B6B3A" style={{ marginTop: 40 }} />;
  }

  return (
    <ScrollView className="flex-1 bg-ssf-bg py-6 px-4">
      <Text className="text-2xl font-poppins-black text-ssf-text mb-6">Schedule Dashboard</Text>
      
      <View className="flex-row flex-wrap gap-3 mb-6">
        <TouchableOpacity 
          className="flex-1 min-w-[140px] bg-ssf-primary p-4 rounded-xl flex-row items-center justify-between"
          onPress={() => router.push('/(admin)/schedule/venues')}
        >
          <View>
            <Text className="font-poppins-bold text-white text-lg">{venues.length}</Text>
            <Text className="font-poppins text-white opacity-80 text-xs">Venues</Text>
          </View>
          <MapPin color="#FFF" size={24} />
        </TouchableOpacity>

        <TouchableOpacity 
          className="flex-1 min-w-[140px] bg-ssf-secondary p-4 rounded-xl flex-row items-center justify-between"
          onPress={() => router.push('/(admin)/schedule/create')}
        >
          <View>
            <Text className="font-poppins-bold text-white text-lg">{schedules.length}</Text>
            <Text className="font-poppins text-white opacity-80 text-xs">Scheduled Events</Text>
          </View>
          <Calendar color="#FFF" size={24} />
        </TouchableOpacity>
      </View>

      {/* Judges quick card */}
      <TouchableOpacity
        className="bg-white border border-ssf-border rounded-xl p-4 mb-6 flex-row items-center justify-between"
        onPress={() => router.push('/(admin)/judges' as any)}
      >
        <View className="flex-row items-center gap-x-3 flex-1 mr-2">
          <View className="w-10 h-10 rounded-full bg-ssf-primary/10 items-center justify-center shrink-0">
            <UserCheck size={20} color="#1B6B3A" />
          </View>
          <View className="flex-1">
            <Text className="font-poppins-bold text-ssf-text">Judge Panel</Text>
            <Text className="font-poppins text-xs text-ssf-text-muted" numberOfLines={1}>Manage judges & assign to events</Text>
          </View>
        </View>
        <Text className="font-poppins-bold text-ssf-primary text-xs shrink-0">Manage →</Text>
      </TouchableOpacity>

      {/* Search Bar */}
      <View className="flex-row items-center bg-white border border-ssf-border rounded-xl px-4 py-2.5 mb-4 shadow-sm">
        <Search size={18} color="#9CA3AF" />
        <TextInput
          className="flex-1 ml-2 font-poppins text-ssf-text outline-none"
          placeholder="Search by item name or category (e.g. LP, UP)..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <X size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {isMobile ? (
        <View className="gap-y-3 mb-6">
          {/* Category Dropdown */}
          <View>
            <Text className="font-poppins-bold text-[10px] text-ssf-text-muted uppercase tracking-wider mb-1 ml-1">Filter by Category</Text>
            {Platform.OS === 'web' ? (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#FFF',
                  border: '1px solid #E2E8F0',
                  padding: '12px',
                  borderRadius: '12px',
                  fontFamily: 'Poppins_400Regular',
                  fontSize: '14px',
                  color: '#334155',
                  outline: 'none',
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml;utf8,<svg fill='gray' height='24' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/><path d='M0 0h24v24H0z' fill='none'/></svg>")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center'
                }}
              >
                {categoriesList.map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-1">
                {categoriesList.map(item => (
                  <TouchableOpacity
                    key={item}
                    onPress={() => setSelectedCategory(item)}
                    className={`px-4 py-1.5 rounded-full mr-2 border ${selectedCategory === item ? 'bg-ssf-primary border-ssf-primary' : 'bg-white border-ssf-border'}`}
                  >
                    <Text className={`font-poppins-bold text-xs ${selectedCategory === item ? 'text-white' : 'text-ssf-text-muted'}`}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Venue Dropdown */}
          <View>
            <Text className="font-poppins-bold text-[10px] text-ssf-text-muted uppercase tracking-wider mb-1 ml-1">Filter by Venue</Text>
            {Platform.OS === 'web' ? (
              <select
                value={selectedVenue}
                onChange={(e) => setSelectedVenue(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#FFF',
                  border: '1px solid #E2E8F0',
                  padding: '12px',
                  borderRadius: '12px',
                  fontFamily: 'Poppins_400Regular',
                  fontSize: '14px',
                  color: '#334155',
                  outline: 'none',
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml;utf8,<svg fill='gray' height='24' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/><path d='M0 0h24v24H0z' fill='none'/></svg>")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center'
                }}
              >
                {venuesList.map(item => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-1">
                {venuesList.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => setSelectedVenue(item.id)}
                    className={`px-4 py-1.5 rounded-full mr-2 border ${selectedVenue === item.id ? 'bg-ssf-secondary border-ssf-secondary' : 'bg-white border-ssf-border'}`}
                  >
                    <Text className={`font-poppins-bold text-xs ${selectedVenue === item.id ? 'text-white' : 'text-ssf-text-muted'}`}>{item.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Status Dropdown */}
          <View>
            <Text className="font-poppins-bold text-[10px] text-ssf-text-muted uppercase tracking-wider mb-1 ml-1">Filter by Status / Workflow</Text>
            {Platform.OS === 'web' ? (
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#FFF',
                  border: '1px solid #E2E8F0',
                  padding: '12px',
                  borderRadius: '12px',
                  fontFamily: 'Poppins_400Regular',
                  fontSize: '14px',
                  color: '#334155',
                  outline: 'none',
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml;utf8,<svg fill='gray' height='24' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/><path d='M0 0h24v24H0z' fill='none'/></svg>")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center'
                }}
              >
                {statusesList.map(item => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-1">
                {statusesList.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => setSelectedStatus(item.id)}
                    className={`px-4 py-1.5 rounded-full mr-2 border ${selectedStatus === item.id ? 'bg-blue-600 border-blue-600' : 'bg-white border-ssf-border'}`}
                  >
                    <Text className={`font-poppins-bold text-xs ${selectedStatus === item.id ? 'text-white' : 'text-ssf-text-muted'}`}>{item.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      ) : (
        /* Desktop: Horizontal Pills */
        <View className="gap-y-4 mb-6">
          {/* Category Filter Pills */}
          <View className="mb-1">
            <Text className="font-poppins-bold text-[10px] text-ssf-text-muted uppercase tracking-wider mb-1.5 ml-1">Filter by Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-1">
              {categoriesList.map(item => (
                <TouchableOpacity
                  key={item}
                  onPress={() => setSelectedCategory(item)}
                  className={`px-4 py-1.5 rounded-full mr-2 border ${selectedCategory === item
                      ? 'bg-ssf-primary border-ssf-primary'
                      : 'bg-white border-ssf-border'
                    }`}
                >
                  <Text className={`font-poppins-bold text-xs ${selectedCategory === item ? 'text-white' : 'text-ssf-text-muted'}`}>
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Venue Filter Pills */}
          <View className="mb-1">
            <Text className="font-poppins-bold text-[10px] text-ssf-text-muted uppercase tracking-wider mb-1.5 ml-1">Filter by Venue</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-1">
              {venuesList.map(item => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => setSelectedVenue(item.id)}
                  className={`px-4 py-1.5 rounded-full mr-2 border ${selectedVenue === item.id
                      ? 'bg-ssf-secondary border-ssf-secondary'
                      : 'bg-white border-ssf-border'
                    }`}
                >
                  <Text className={`font-poppins-bold text-xs ${selectedVenue === item.id ? 'text-white' : 'text-ssf-text-muted'}`}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Status Filter Pills */}
          <View className="mb-1">
            <Text className="font-poppins-bold text-[10px] text-ssf-text-muted uppercase tracking-wider mb-1.5 ml-1">Filter by Status / Workflow</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-1">
              {statusesList.map(item => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => setSelectedStatus(item.id)}
                  className={`px-4 py-1.5 rounded-full mr-2 border ${selectedStatus === item.id
                      ? 'bg-blue-600 border-blue-600'
                      : 'bg-white border-ssf-border'
                    }`}
                >
                  <Text className={`font-poppins-bold text-xs ${selectedStatus === item.id ? 'text-white' : 'text-ssf-text-muted'}`}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      <View className="flex-row justify-between items-center mb-4 flex-wrap gap-y-2">
        <Text className="font-poppins-bold text-lg text-ssf-text">Upcoming Schedule</Text>
        <View className="flex-row gap-x-2">
          <TouchableOpacity 
            className="flex-row items-center gap-x-1 bg-blue-50 px-3 py-2 rounded-lg border border-blue-100"
            onPress={() => router.push('/(admin)/schedule/import-json' as any)}
          >
            <Text className="font-poppins-bold text-blue-700 text-xs">Import JSON</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            className="flex-row items-center gap-x-1 bg-ssf-primary/10 px-3 py-2 rounded-lg border border-ssf-primary/20"
            onPress={() => router.push('/(admin)/schedule/create')}
          >
            <Plus size={14} color="#1B6B3A" />
            <Text className="font-poppins-bold text-xs text-ssf-primary">Add New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {schedules.length === 0 ? (
        <SsfCard className="items-center py-10">
          <Calendar size={48} color="#D1D5DB" className="mb-4" />
          <Text className="font-poppins text-ssf-text-muted text-center">No schedules created yet.</Text>
          <SsfButton 
            label="Create First Schedule" 
            onPress={() => router.push('/(admin)/schedule/create')}
            className="mt-4"
          />
        </SsfCard>
      ) : filteredSchedules.length === 0 ? (
        <SsfCard className="items-center py-10">
          <Search size={48} color="#D1D5DB" className="mb-4" />
          <Text className="font-poppins text-ssf-text-muted text-center">
            No scheduled events found matching your search or filters.
          </Text>
          <TouchableOpacity 
            onPress={() => {
              setSearchQuery('');
              setSelectedCategory('All');
              setSelectedVenue('All');
              setSelectedStatus('All');
            }} 
            className="mt-4"
          >
            <Text className="font-poppins-bold text-ssf-primary text-sm">Reset All Filters</Text>
          </TouchableOpacity>
        </SsfCard>
      ) : (
        <View className="gap-y-4">
          {filteredSchedules.map((schedule: any) => (
            <SsfCard key={schedule.id} className="p-4">
              {/* Card Header: Title + Actions */}
              <View className="mb-2">
                {/* Top row: title left, action buttons right */}
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 mr-2">
                    <Text className="font-poppins-bold text-base" numberOfLines={2}>{schedule.items?.item_name_en || 'Unknown Event'}</Text>
                    {schedule.items?.item_name_ml ? (
                      <Text className="font-poppins text-xs text-ssf-text-muted mt-0.5" numberOfLines={1}>{schedule.items.item_name_ml}</Text>
                    ) : null}
                  </View>
                  {/* Edit / Delete buttons */}
                  <View className="flex-row items-center gap-x-2 shrink-0">
                    <TouchableOpacity 
                      className={`p-2 bg-gray-50 rounded-lg border border-gray-200 ${schedule.is_shuffle_locked ? 'opacity-50' : ''}`}
                      onPress={() => {
                        if (schedule.is_shuffle_locked) {
                          if (Platform.OS === 'web') window.alert('Cannot edit schedule after event is locked.');
                          else Alert.alert('Locked', 'Cannot edit schedule after event is locked.');
                          return;
                        }
                        router.push(`/(admin)/schedule/${schedule.id}/edit` as any);
                      }}
                    >
                      <Edit size={14} color="#4B5563" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      className="p-2 bg-red-50 rounded-lg border border-red-200"
                      onPress={() => handleDelete(schedule.id, schedule.items?.item_name_en || 'Unknown Event')}
                    >
                      <Trash2 size={14} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Venue badge — below title row on all sizes */}
                <View className="mt-2 self-start">
                  <View className="bg-green-100 px-2 py-1 rounded">
                    <Text className="font-poppins-bold text-xs text-green-800">{schedule.venues?.name || 'Unknown Venue'}</Text>
                  </View>
                </View>

                {/* Category Badges */}
                {schedule.items?.category_codes && schedule.items.category_codes.length > 0 && (
                  <View className="flex-row flex-wrap gap-1 mt-2">
                    {(schedule.items.category_codes as string[]).map((code: string) => (
                      <View key={code} className="bg-ssf-primary/10 border border-ssf-primary/20 px-2 py-0.5 rounded-full">
                        <Text className="font-poppins-bold text-[10px] text-ssf-primary">{code}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              
              {/* Time & Date row */}
              <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 mb-3">
                <View className="flex-row items-center gap-x-1">
                  <Clock size={13} color="#6B7280" />
                  <Text className="font-poppins text-xs text-gray-600">
                    {new Date(schedule.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(schedule.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <View className="flex-row items-center gap-x-1">
                  <Calendar size={13} color="#6B7280" />
                  <Text className="font-poppins text-xs text-gray-600">
                    {new Date(schedule.start_time).toLocaleDateString()}
                  </Text>
                </View>
              </View>

              <ScheduleWorkflowBadges 
                scheduleId={schedule.id} 
                registrations={allRegistrations.filter((r: any) => r.item_id === schedule.item_id)} 
                isShuffleLocked={schedule.is_shuffle_locked}
              />

              {/* Action buttons — 2×2 grid on mobile */}
              <View className="flex-row flex-wrap gap-2 border-t border-gray-100 pt-3 mt-3">
                <View className="flex-row gap-x-2 w-full">
                  <SsfButton 
                    label="Check-In" 
                    variant="outline" 
                    size="sm"
                    className="flex-1"
                    onPress={() => router.push(`/(admin)/schedule/${schedule.id}/checkin` as any)}
                  />
                  <SsfButton 
                    label="Code Letters" 
                    variant="outline" 
                    size="sm"
                    className="flex-1"
                    onPress={() => router.push(`/(admin)/schedule/${schedule.id}/code-letter` as any)}
                  />
                </View>
                <View className="flex-row gap-x-2 w-full">
                  <SsfButton 
                    label="📝 Marks" 
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onPress={() => router.push(`/(admin)/schedule/${schedule.id}/marks` as any)}
                  />
                  <SsfButton 
                    label="🏆 Results" 
                    size="sm"
                    className="flex-1"
                    onPress={() => router.push(`/(admin)/schedule/${schedule.id}/results` as any)}
                  />
                </View>
              </View>
            </SsfCard>
          ))}
        </View>
      )}
      <AdminScheduleChatBot schedules={schedules} venues={venues} registrations={allRegistrations} results={allResults} judges={judges} />
    </ScrollView>
  );
}
