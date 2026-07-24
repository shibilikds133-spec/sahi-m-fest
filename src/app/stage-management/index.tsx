import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Platform, TextInput, useWindowDimensions, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { SsfCard } from '../../components/ui/SsfCard';
import { SsfButton } from '../../components/ui/SsfButton';
import { useSchedule, usePublicSchedule, usePublicRegistrations } from '../../core/hooks/useSchedule';
import { Calendar, MapPin, Clock, Search, X, Lock, Bell, RefreshCw } from 'lucide-react-native';
import { useGetPublicLeaderboardSettings } from '../../core/hooks/useLeaderboardSettings';

function ScheduleWorkflowBadges({ registrations = [] }: { registrations?: any[] }) {
  const activeRegs = registrations.filter((r: any) => r.status !== 'rejected');
  const verifiedRegs = activeRegs.filter((r: any) => r.is_verified);
  
  const checkinDone = activeRegs.length > 0 && activeRegs.every((r: any) => r.is_verified);
  const checkinPending = activeRegs.length > 0 && activeRegs.some((r: any) => !r.is_verified);
  
  const codesShuffled = verifiedRegs.length > 0 && verifiedRegs.every((r: any) => r.code_letter !== null && r.code_letter !== undefined);
  const codesPending = verifiedRegs.length > 0 && verifiedRegs.some((r: any) => r.code_letter === null || r.code_letter === undefined);

  const badges: { label: string; bg: string; text: string }[] = [];

  // Check-in status (Malayalam highlighted text as requested)
  if (checkinDone) {
    badges.push({ label: 'Check-in Kazhinju', bg: 'bg-green-100 border border-green-200', text: 'text-green-700' });
  } else if (checkinPending) {
    badges.push({ label: 'Check-in Pending', bg: 'bg-amber-100 border border-amber-200', text: 'text-amber-700' });
  }

  // Code Letter status
  if (codesShuffled) {
    badges.push({ label: 'Codes Shuffled', bg: 'bg-blue-100 border border-blue-200', text: 'text-blue-700' });
  } else if (codesPending) {
    badges.push({ label: 'Codes Pending', bg: 'bg-gray-100 border border-gray-200', text: 'text-gray-500' });
  }

  if (!badges.length) return null;

  return (
    <View className="flex-row flex-wrap gap-2 mt-2">
      {badges.map((badge) => (
        <View key={badge.label} className={`flex-row items-center gap-x-1 px-2 py-0.5 rounded-full self-start ${badge.bg}`}>
          <Text className={`font-poppins-bold text-[10px] ${badge.text}`}>{badge.label}</Text>
        </View>
      ))}
    </View>
  );
}

export default function StageManagementDashboard() {
  const router = useRouter();
  
  // Simple Lightweight Passcode Protection
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  const CORRECT_PASSCODE = '9999'; // Default simple passcode for stage coordinators

  const handleLogin = () => {
    if (passcode === CORRECT_PASSCODE) {
      setIsAuthenticated(true);
      setErrorMsg('');
    } else {
      setErrorMsg('Incorrect Passcode');
    }
  };

  const settingsQuery = useGetPublicLeaderboardSettings();
  const festivalId = settingsQuery.data?.festival_id;

  const schedulesQuery = usePublicSchedule(festivalId);
  const schedules = schedulesQuery.data || [];
  const isLoadingSchedules = schedulesQuery.isLoading;

  const registrationsQuery = usePublicRegistrations(festivalId);
  const allRegistrations = registrationsQuery.data || [];
  const isLoadingRegs = registrationsQuery.isLoading;

  const venues = React.useMemo(() => {
    const venueMap = new Map<string, any>();
    schedules.forEach((s: any) => {
      const v = s.venues;
      if (v) {
        venueMap.set(v.id || v.name, { id: v.id, name: v.name });
      }
    });
    return Array.from(venueMap.values());
  }, [schedules]);

  const isLoadingVenues = isLoadingSchedules;
  const festival = { id: festivalId };
  const isLoadingFest = settingsQuery.isLoading;
  
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      schedulesQuery.refetch(),
      registrationsQuery.refetch()
    ]);
    setRefreshing(false);
  }, [schedulesQuery, registrationsQuery]);

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
  ];

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

        if (selectedStatus === 'checkin_pending') {
          matchesStatus = checkinPending;
        } else if (selectedStatus === 'checkin_done') {
          matchesStatus = checkinDone;
        } else if (selectedStatus === 'codes_pending') {
          matchesStatus = codesPending;
        } else if (selectedStatus === 'codes_done') {
          matchesStatus = codesShuffled;
        }
      }
      
      return matchesSearch && matchesCategory && matchesVenue && matchesStatus;
    });
  }, [schedules, searchQuery, selectedCategory, selectedVenue, selectedStatus, allRegistrations]);

  if (!isAuthenticated) {
    return (
      <View className="flex-1 bg-ssf-bg justify-center items-center px-4">
        <SsfCard className="w-full max-w-sm p-6 items-center">
          <View className="w-16 h-16 bg-green-50 rounded-full items-center justify-center mb-4">
            <Lock size={32} color="#1B6B3A" />
          </View>
          <Text className="text-xl font-poppins-black text-ssf-text text-center mb-2">Stage Management</Text>
          <Text className="font-poppins text-ssf-text-muted text-center mb-6 text-sm">
            Please enter the passcode to access the stage portal.
          </Text>
          
          <TextInput
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-poppins-bold text-center text-xl tracking-widest text-ssf-text mb-2"
            placeholder="****"
            secureTextEntry
            keyboardType="numeric"
            value={passcode}
            onChangeText={(text) => {
              setPasscode(text);
              setErrorMsg('');
            }}
            onSubmitEditing={handleLogin}
          />
          
          {errorMsg ? (
            <Text className="font-poppins text-red-500 text-xs mb-4">{errorMsg}</Text>
          ) : <View className="h-4 mb-4" />}
          
          <SsfButton 
            label="Enter Portal" 
            onPress={handleLogin}
            className="w-full"
          />
        </SsfCard>
      </View>
    );
  }

  if (isLoadingSchedules || isLoadingVenues || isLoadingRegs || isLoadingFest) {
    return <ActivityIndicator color="#1B6B3A" style={{ marginTop: 40 }} />;
  }

  return (
    <ScrollView 
      className="flex-1 bg-ssf-bg py-6 px-4"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View className="flex-row justify-between items-center mb-6">
        <Text className="text-2xl font-poppins-black text-ssf-text">Stage Portal</Text>
        <View className="flex-row gap-x-3">
          <TouchableOpacity
            onPress={onRefresh}
            disabled={refreshing}
            className="p-2 bg-gray-100 rounded-full"
          >
            <RefreshCw size={20} color="#374151" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/notifications' as any)}
            className="p-2 bg-gray-100 rounded-full"
          >
            <Bell size={20} color="#374151" />
          </TouchableOpacity>
        </View>
      </View>
      
      <View className="flex-row flex-wrap gap-3 mb-6">
        <View className="flex-1 min-w-[140px] bg-ssf-primary p-4 rounded-xl flex-row items-center justify-between">
          <View>
            <Text className="font-poppins-bold text-white text-lg">{venues.length}</Text>
            <Text className="font-poppins text-white opacity-80 text-xs">Venues</Text>
          </View>
          <MapPin color="#FFF" size={24} />
        </View>

        <View className="flex-1 min-w-[140px] bg-ssf-secondary p-4 rounded-xl flex-row items-center justify-between">
          <View>
            <Text className="font-poppins-bold text-white text-lg">{schedules.length}</Text>
            <Text className="font-poppins text-white opacity-80 text-xs">Scheduled Events</Text>
          </View>
          <Calendar color="#FFF" size={24} />
        </View>
      </View>

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

      {schedules.length === 0 ? (
        <SsfCard className="items-center py-10">
          <Calendar size={48} color="#D1D5DB" className="mb-4" />
          <Text className="font-poppins text-ssf-text-muted text-center">No schedules created yet.</Text>
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
                {/* Top row: title left */}
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 mr-2">
                    <Text className="font-poppins-bold text-base" numberOfLines={2}>{schedule.items?.item_name_en || 'Unknown Event'}</Text>
                    {schedule.items?.item_name_ml ? (
                      <Text className="font-poppins text-xs text-ssf-text-muted mt-0.5" numberOfLines={1}>{schedule.items.item_name_ml}</Text>
                    ) : null}
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
                registrations={allRegistrations.filter((r: any) => r.item_id === schedule.item_id)} 
              />

              {/* Action buttons — 2×2 grid on mobile */}
              <View className="flex-row flex-wrap gap-2 border-t border-gray-100 pt-3 mt-3">
                <View className="flex-row gap-x-2 w-full">
                  <SsfButton 
                    label="Check-In" 
                    variant="outline" 
                    size="sm"
                    className="flex-1"
                    onPress={() => router.push(`/stage-management/${schedule.id}/checkin` as any)}
                  />
                  <SsfButton 
                    label="Code Letters" 
                    variant="outline" 
                    size="sm"
                    className="flex-1"
                    onPress={() => router.push(`/stage-management/${schedule.id}/code-letter` as any)}
                  />
                </View>
              </View>
            </SsfCard>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
