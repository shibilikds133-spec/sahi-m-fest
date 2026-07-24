import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal, Clipboard, Share,
  TextInput, useWindowDimensions, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Plus, Trash2, UserCheck, Phone, Key, Copy, Share2, Activity, Search, MapPin, ListFilter, Users } from 'lucide-react-native';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { SsfInput } from '../../../components/ui/SsfInput';
import { useJudges } from '../../../core/hooks/useJudges';
import { useAuthStore } from '../../../core/store/authStore';
import { judgeTokenService } from '../../../services/judgeTokenService';
import { useSchedule } from '../../../core/hooks/useSchedule';

export default function JudgesPage() {
  const router = useRouter();
  const { user, tenant_id } = useAuthStore();
  const { judges, isLoadingJudges, createJudge, deleteJudge, assignJudges } = useJudges();
  const { schedules, venues } = useSchedule();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [activeTab, setActiveTab] = useState<'judges' | 'assignments'>('judges');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', specialization: '' });
  const [selectedJudgeForToken, setSelectedJudgeForToken] = useState<any>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [eventSearchQuery, setEventSearchQuery] = useState('');

  // Filters for Assignments Tab
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedVenue, setSelectedVenue] = useState('All');
  const [selectedAssignedJudge, setSelectedAssignedJudge] = useState('All');

  const categoriesList = ['All', 'LP', 'UP', 'HS', 'HSS', 'JUNIOR', 'SENIOR', 'CAMPUS', 'GENERAL'];

  const filteredSchedules = useMemo(() => {
    return (schedules as any[]).filter(schedule => {
      let matchesSearch = true;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchNameEn = schedule.items?.item_name_en?.toLowerCase().includes(query);
        const matchNameMl = schedule.items?.item_name_ml?.toLowerCase().includes(query);
        const matchCode = schedule.items?.item_code?.toLowerCase().includes(query);
        matchesSearch = matchNameEn || matchNameMl || matchCode;
      }
      
      let matchesCategory = true;
      if (selectedCategory !== 'All') {
        const codes = Array.isArray(schedule.items?.category_codes) 
          ? schedule.items.category_codes 
          : (schedule.items?.category_codes ? [schedule.items.category_codes] : []);
        
        const catShort = selectedCategory === 'SENIOR' ? 'SR' : (selectedCategory === 'JUNIOR' ? 'JR' : (selectedCategory === 'CAMPUS' ? 'CA' : (selectedCategory === 'GENERAL' ? 'GN' : selectedCategory)));
        const catLong = selectedCategory === 'SR' ? 'SENIOR' : (selectedCategory === 'JR' ? 'JUNIOR' : (selectedCategory === 'CA' ? 'CAMPUS' : (selectedCategory === 'GN' ? 'GENERAL' : selectedCategory)));

        matchesCategory = codes.includes(selectedCategory) || codes.includes(catShort) || codes.includes(catLong);
      }
      
      let matchesVenue = true;
      if (selectedVenue !== 'All') {
        matchesVenue = schedule.venue_id === selectedVenue || schedule.venues?.id === selectedVenue;
      }

      let matchesJudge = true;
      if (selectedAssignedJudge !== 'All') {
        matchesJudge = schedule.judge_panel_id && schedule.judge_panel_id.includes(selectedAssignedJudge);
      }

      return matchesSearch && matchesCategory && matchesVenue && matchesJudge;
    });
  }, [schedules, searchQuery, selectedCategory, selectedVenue, selectedAssignedJudge]);

  const modalFilteredSchedules = useMemo(() => {
    if (!eventSearchQuery.trim()) return schedules as any[];
    const query = eventSearchQuery.toLowerCase().trim();
    return (schedules as any[]).filter(s => {
      const nameEn = s.items?.item_name_en?.toLowerCase() || '';
      const nameMl = s.items?.item_name_ml?.toLowerCase() || '';
      const code = s.items?.item_code?.toLowerCase() || '';
      return nameEn.includes(query) || nameMl.includes(query) || code.includes(query);
    });
  }, [schedules, eventSearchQuery]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('Error', 'Judge name is required');
      return;
    }
    try {
      await createJudge.mutateAsync({
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        specialization: form.specialization
          ? form.specialization.split(',').map(s => s.trim()).filter(Boolean)
          : [],
      });
      setForm({ name: '', phone: '', specialization: '' });
      setIsAddModalOpen(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Delete Judge', `Remove "${name}" from the panel?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteJudge.mutate(id) },
    ]);
  };

  const openTokenModal = (judge: any, scheduleId: string = '') => {
    setSelectedJudgeForToken(judge);
    setGeneratedToken(null);
    setSelectedScheduleId(scheduleId);
    setEventSearchQuery('');
    setIsTokenModalOpen(true);
  };

  const handleGenerateToken = async () => {
    setErrorMessage(null);
    if (!selectedScheduleId) {
      setErrorMessage('Please select an event for this judge.');
      return;
    }
    if (!selectedJudgeForToken?.id) {
      setErrorMessage('No judge selected. Please try again.');
      return;
    }
    if (!tenant_id) {
      setErrorMessage('Session error: tenant_id is missing.');
      return;
    }

    setIsGenerating(true);
    try {
      const result = await judgeTokenService.generateToken({
        judgeId: selectedJudgeForToken.id,
        scheduleId: selectedScheduleId,
        tenantId: tenant_id,
        createdBy: user?.id ?? '',
      });

      const tokenString = typeof result === 'string' ? result : result?.token;
      if (!tokenString) {
        setErrorMessage('Token was not returned from server.');
        return;
      }
      
      // Auto-assign judge to schedule if not assigned
      const schedule = (schedules as any[]).find(s => s.id === selectedScheduleId);
      if (schedule) {
        let currentPanel = schedule.judge_panel_id || [];
        if (typeof currentPanel === 'string') {
          try {
            currentPanel = JSON.parse(currentPanel);
          } catch {
            currentPanel = [];
          }
        }
        if (!Array.isArray(currentPanel)) {
          currentPanel = [];
        }
        
        // Handle case where elements themselves might be stringified arrays
        currentPanel = currentPanel.flatMap((item: any) => {
          if (typeof item === 'string' && item.startsWith('[')) {
            try { return JSON.parse(item); } catch { return item; }
          }
          return item;
        });

        if (!currentPanel.includes(selectedJudgeForToken.id)) {
          await assignJudges.mutateAsync({
            scheduleId: selectedScheduleId,
            judgeIds: [...currentPanel, selectedJudgeForToken.id]
          });
        }
      }

      setGeneratedToken(tokenString);
    } catch (e: any) {
      setErrorMessage(e.message ?? 'Unknown error occurred.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToken = () => {
    if (generatedToken) {
      Clipboard.setString(generatedToken);
      Alert.alert('Copied!', 'Access code copied to clipboard.');
    }
  };

  const shareToken = async () => {
    if (generatedToken && selectedJudgeForToken) {
      const schedule = schedules?.find((s: any) => s.id === selectedScheduleId);
      await Share.share({
        message: `السلام عليكم ${selectedJudgeForToken.name},\n\nYour judge access code for "${schedule?.items?.item_name_ml ?? 'the event'}" is:\n\n🔑 ${generatedToken}\n\nVisit the Judge Portal to enter marks.\n\nThis code is for single use only.`,
      });
    }
  };

  return (
    <View className="flex-1 bg-ssf-bg">
      <LinearGradient
        colors={['#065F46', '#044230']}
        style={{ paddingTop: 56, paddingBottom: 40, paddingHorizontal: 24, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, marginBottom: 16 }}
      >
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/schedule' as any)} className="mr-3 p-2 bg-white/10 rounded-full">
              <ArrowLeft size={22} color="#FFF" />
            </TouchableOpacity>
            <Text className="text-2xl font-poppins-black text-white">Judge Panel</Text>
          </View>
          <TouchableOpacity 
            onPress={() => router.push('/(admin)/judges/audit' as any)}
            className="flex-row items-center bg-yellow-400/20 px-4 py-2 rounded-xl border border-yellow-400/50"
          >
            <Activity size={16} color="#FBBF24" />
            <Text className="font-poppins-bold text-yellow-400 text-sm ml-2">Audit Log</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-white/70 font-poppins text-sm mb-4">
          {judges.length} judge{judges.length !== 1 ? 's' : ''} registered
        </Text>

        {/* Tabs */}
        <View className="flex-row bg-white/10 p-1 rounded-xl">
          <TouchableOpacity 
            onPress={() => setActiveTab('judges')} 
            className={`flex-1 py-2 rounded-lg items-center ${activeTab === 'judges' ? 'bg-white' : ''}`}
          >
            <Text className={`font-poppins-bold text-sm ${activeTab === 'judges' ? 'text-ssf-primary' : 'text-white'}`}>Judges Directory</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setActiveTab('assignments')} 
            className={`flex-1 py-2 rounded-lg items-center ${activeTab === 'assignments' ? 'bg-white' : ''}`}
          >
            <Text className={`font-poppins-bold text-sm ${activeTab === 'assignments' ? 'text-ssf-primary' : 'text-white'}`}>Assignments & Codes</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView className="flex-1 px-4">
        {isLoadingJudges ? (
          <ActivityIndicator color="#1B6B3A" style={{ marginTop: 40 }} />
        ) : activeTab === 'judges' ? (
          /* ================= JUDGES DIRECTORY ================= */
          judges.length === 0 ? (
            <SsfCard className="items-center py-10">
              <UserCheck size={48} color="#D1D5DB" />
              <Text className="font-poppins-bold text-ssf-text-muted mt-3">No judges added yet</Text>
              <Text className="font-poppins text-ssf-text-muted text-sm text-center mt-1">
                Add judges who will evaluate participants
              </Text>
            </SsfCard>
          ) : (
            <View className="gap-y-3 mb-24">
              <View className={`flex-row flex-wrap ${!isMobile ? 'flex-row' : 'flex-col gap-y-3'}`}>
                {judges.map((judge: any) => (
                  <View key={judge.id} className={`${isMobile ? 'w-full' : 'w-1/2 p-2'}`}>
                    <SsfCard className="h-full">
                      <View className="flex-row items-center mb-3">
                        <View className="w-12 h-12 rounded-2xl bg-ssf-primary/10 items-center justify-center mr-3">
                          <Text className="font-poppins-black text-ssf-primary text-lg">
                            {judge.name?.charAt(0)?.toUpperCase() ?? '?'}
                          </Text>
                        </View>
                        <View className="flex-1">
                          <Text className="font-poppins-bold text-ssf-text text-base">{judge.name}</Text>
                          {judge.phone && (
                            <View className="flex-row items-center gap-x-1 mt-0.5">
                              <Phone size={11} color="#6B7280" />
                              <Text className="font-poppins text-xs text-ssf-text-muted">{judge.phone}</Text>
                            </View>
                          )}
                          {judge.specialization?.length > 0 && (
                            <Text className="font-poppins text-xs text-ssf-primary mt-0.5" numberOfLines={1}>
                              {judge.specialization.join(', ')}
                            </Text>
                          )}
                        </View>
                        <TouchableOpacity onPress={() => handleDelete(judge.id, judge.name)} className="p-2">
                          <Trash2 size={18} color="#EF4444" />
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        onPress={() => openTokenModal(judge)}
                        className="flex-row items-center justify-center gap-x-2 bg-ssf-primary/10 border border-ssf-primary/20 rounded-xl py-2.5 px-4 mt-auto"
                      >
                        <Key size={14} color="#1B6B3A" />
                        <Text className="font-poppins-bold text-ssf-primary text-sm">Generate Code (Any Event)</Text>
                      </TouchableOpacity>
                    </SsfCard>
                  </View>
                ))}
              </View>
            </View>
          )
        ) : (
          /* ================= ASSIGNMENTS TABLE ================= */
          <View className="mb-24">
            {/* Filters */}
            <View className={`flex-row flex-wrap gap-2 mb-4 bg-white p-3 rounded-xl border border-gray-100`}>
              <View className="flex-row items-center bg-gray-50 rounded-lg px-3 h-10 border border-gray-200 w-full mb-2">
                <Search size={16} color="#9CA3AF" />
                <TextInput
                  className="flex-1 ml-2 font-poppins text-sm text-ssf-text h-full outline-none"
                  placeholder="Search by Item Name or Code..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
              
              <View className="flex-1 min-w-[120px]">
                <Text className="font-poppins text-[10px] text-gray-500 uppercase tracking-wider mb-1 ml-1">Category</Text>
                {Platform.OS === 'web' ? (
                  <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full bg-gray-50 border border-gray-200 p-2 rounded-lg font-poppins text-sm">
                    {categoriesList.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <TouchableOpacity className="bg-gray-50 border border-gray-200 p-2 rounded-lg"><Text>{selectedCategory}</Text></TouchableOpacity>
                )}
              </View>

              <View className="flex-1 min-w-[120px]">
                <Text className="font-poppins text-[10px] text-gray-500 uppercase tracking-wider mb-1 ml-1">Venue</Text>
                {Platform.OS === 'web' ? (
                  <select value={selectedVenue} onChange={(e) => setSelectedVenue(e.target.value)} className="w-full bg-gray-50 border border-gray-200 p-2 rounded-lg font-poppins text-sm">
                    <option value="All">All Venues</option>
                    {(venues as any[]).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                ) : (
                  <TouchableOpacity className="bg-gray-50 border border-gray-200 p-2 rounded-lg"><Text>Venue Filter</Text></TouchableOpacity>
                )}
              </View>

              <View className="flex-1 min-w-[120px]">
                <Text className="font-poppins text-[10px] text-gray-500 uppercase tracking-wider mb-1 ml-1">Assigned Judge</Text>
                {Platform.OS === 'web' ? (
                  <select value={selectedAssignedJudge} onChange={(e) => setSelectedAssignedJudge(e.target.value)} className="w-full bg-gray-50 border border-gray-200 p-2 rounded-lg font-poppins text-sm">
                    <option value="All">All Judges</option>
                    {(judges as any[]).map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                  </select>
                ) : (
                  <TouchableOpacity className="bg-gray-50 border border-gray-200 p-2 rounded-lg"><Text>Judge Filter</Text></TouchableOpacity>
                )}
              </View>
            </View>

            {filteredSchedules.length === 0 ? (
              <View className="items-center py-10 bg-white rounded-xl border border-gray-100">
                <ListFilter size={40} color="#D1D5DB" />
                <Text className="font-poppins text-ssf-text-muted mt-3">No assignments match your filters.</Text>
              </View>
            ) : isMobile ? (
              /* Mobile Cards Layout */
              <View className="gap-y-3">
                {filteredSchedules.map(schedule => (
                  <SsfCard key={schedule.id} className="p-4">
                    <View className="flex-row justify-between items-start mb-2">
                      <View className="flex-1">
                        <Text className="font-poppins-bold text-ssf-text text-base">
                          {schedule.items?.item_name_en}
                          {schedule.items?.item_code ? ` (${schedule.items.item_code})` : ''}
                        </Text>
                        {schedule.items?.item_name_ml && <Text className="font-poppins text-xs text-ssf-text-muted">{schedule.items.item_name_ml}</Text>}
                        {schedule.items?.category_codes && (
                          <Text className="font-poppins text-[10px] text-ssf-primary mt-1">{(schedule.items.category_codes as string[]).join(', ')}</Text>
                        )}
                      </View>
                      <View className="bg-blue-100 px-2 py-0.5 rounded-full">
                        <Text className="font-poppins-bold text-[10px] text-blue-700">{schedule.venues?.name || 'No Venue'}</Text>
                      </View>
                    </View>

                    <Text className="font-poppins-bold text-sm text-ssf-text mb-2 border-t border-gray-100 pt-2 mt-2">Assigned Judges:</Text>
                    {schedule.judge_panel_id && schedule.judge_panel_id.length > 0 ? (
                      <View className="gap-y-2">
                        {schedule.judge_panel_id.map((jid: string) => {
                          const j = judges.find((x: any) => x.id === jid);
                          if (!j) return null;
                          return (
                            <View key={jid} className="flex-row justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
                              <View className="flex-row items-center gap-x-2">
                                <View className="w-6 h-6 rounded-full bg-ssf-primary/20 items-center justify-center">
                                  <Text className="font-poppins-bold text-ssf-primary text-[10px]">{j.name.charAt(0)}</Text>
                                </View>
                                <Text className="font-poppins text-xs text-ssf-text">{j.name}</Text>
                              </View>
                              <TouchableOpacity onPress={() => openTokenModal(j, schedule.id)} className="bg-ssf-primary px-3 py-1.5 rounded-md">
                                <Text className="font-poppins-bold text-white text-[10px]">Gen Code</Text>
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <Text className="font-poppins text-xs text-gray-400 italic mb-2">No judges assigned</Text>
                    )}
                    
                    <TouchableOpacity 
                      className="mt-3 flex-row items-center justify-center gap-x-1 border border-dashed border-gray-300 py-2 rounded-lg"
                      onPress={() => router.push(`/(admin)/schedule/${schedule.id}/edit` as any)}
                    >
                      <Users size={14} color="#6B7280" />
                      <Text className="font-poppins-bold text-xs text-gray-500">Manage Panel in Event</Text>
                    </TouchableOpacity>
                  </SsfCard>
                ))}
              </View>
            ) : (
              /* Desktop / Tablet Hybrid Table Layout */
              <View className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <View className="flex-row bg-gray-50 p-3 border-b border-gray-200">
                  <Text className="font-poppins-bold text-xs text-gray-500 w-1/3">Event Details</Text>
                  <Text className="font-poppins-bold text-xs text-gray-500 w-1/6">Venue</Text>
                  <Text className="font-poppins-bold text-xs text-gray-500 flex-1">Assigned Judges & Codes</Text>
                </View>
                {filteredSchedules.map(schedule => (
                  <View key={schedule.id} className="flex-row p-3 border-b border-gray-100 items-start">
                    <View className="w-1/3 pr-2">
                      <Text className="font-poppins-bold text-sm text-ssf-text">
                        {schedule.items?.item_name_en} {schedule.items?.item_code ? `(${schedule.items.item_code})` : ''}
                      </Text>
                      {schedule.items?.item_name_ml && <Text className="font-poppins text-xs text-gray-500">{schedule.items.item_name_ml}</Text>}
                      {schedule.items?.category_codes && (
                        <Text className="font-poppins text-[10px] text-ssf-primary mt-1">{(schedule.items.category_codes as string[]).join(', ')}</Text>
                      )}
                    </View>
                    <View className="w-1/6 justify-center">
                      <View className="bg-blue-50 self-start px-2 py-1 rounded">
                        <Text className="font-poppins text-[10px] text-blue-700">{schedule.venues?.name || 'N/A'}</Text>
                      </View>
                    </View>
                    <View className="flex-1 gap-y-2">
                      {schedule.judge_panel_id && schedule.judge_panel_id.length > 0 ? (
                        schedule.judge_panel_id.map((jid: string) => {
                          const j = judges.find((x: any) => x.id === jid);
                          if (!j) return null;
                          return (
                            <View key={jid} className="flex-row justify-between items-center bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                              <Text className="font-poppins text-sm text-ssf-text">{j.name}</Text>
                              <TouchableOpacity onPress={() => openTokenModal(j, schedule.id)} className="bg-ssf-primary/10 px-3 py-1.5 rounded-lg border border-ssf-primary/20">
                                <Text className="font-poppins-bold text-ssf-primary text-xs">Generate Code</Text>
                              </TouchableOpacity>
                            </View>
                          );
                        })
                      ) : (
                        <Text className="font-poppins text-xs text-gray-400 italic">No judges assigned.</Text>
                      )}
                      <TouchableOpacity 
                        className="self-start mt-1"
                        onPress={() => router.push(`/(admin)/schedule/${schedule.id}/edit` as any)}
                      >
                        <Text className="font-poppins-bold text-xs text-blue-600">+ Edit Panel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* FAB - Only show in Judges tab */}
      {activeTab === 'judges' && (
        <View className="absolute bottom-8 right-5">
          <TouchableOpacity
            onPress={() => setIsAddModalOpen(true)}
            className="bg-ssf-primary w-14 h-14 rounded-full items-center justify-center shadow-lg"
          >
            <Plus size={26} color="#FFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Add Judge Modal ── */}
      <Modal visible={isAddModalOpen} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white p-6 rounded-t-3xl">
            <Text className="text-xl font-poppins-black text-ssf-text mb-5">Add Judge</Text>
            <SsfInput label="Full Name *" placeholder="e.g., Abdul Rahman" value={form.name} onChangeText={v => setForm({ ...form, name: v })} className="mb-4" />
            <SsfInput label="Phone Number" placeholder="e.g., 9876543210" value={form.phone} onChangeText={v => setForm({ ...form, phone: v })} className="mb-4" />
            <SsfInput label="Specialization (comma-separated)" placeholder="e.g., Mappilappattu, Elocution" value={form.specialization} onChangeText={v => setForm({ ...form, specialization: v })} className="mb-6" />
            <SsfButton label="Add Judge" onPress={handleSave} isLoading={createJudge.isPending} className="mb-3" />
            <SsfButton label="Cancel" variant="outline" onPress={() => { setForm({ name: '', phone: '', specialization: '' }); setIsAddModalOpen(false); }} />
          </View>
        </View>
      </Modal>

      {/* ── Generate Token Modal ── */}
      <Modal visible={isTokenModalOpen} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white p-6 rounded-t-3xl">
            <Text className="text-xl font-poppins-black text-ssf-text mb-1">Access Code</Text>
            <Text className="font-poppins text-ssf-text-muted text-sm mb-5">For: {selectedJudgeForToken?.name}</Text>

            {!generatedToken ? (
              <>
                <Text className="font-poppins-bold text-ssf-text mb-2">Select Event *</Text>
                
                <View className="flex-row items-center bg-gray-50 rounded-lg px-3 h-10 border border-gray-200 w-full mb-3">
                  <Search size={16} color="#9CA3AF" />
                  <TextInput
                    className="flex-1 ml-2 font-poppins text-sm text-ssf-text h-full outline-none"
                    placeholder="Search by event name or code..."
                    value={eventSearchQuery}
                    onChangeText={setEventSearchQuery}
                  />
                </View>

                <ScrollView style={{ maxHeight: 200 }} className="mb-4">
                  {modalFilteredSchedules?.map(s => (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => setSelectedScheduleId(s.id)}
                      className={`px-4 py-3 rounded-xl mb-2 border ${
                        selectedScheduleId === s.id ? 'bg-ssf-primary/10 border-ssf-primary' : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <Text className={`font-poppins-bold text-sm ${selectedScheduleId === s.id ? 'text-ssf-primary' : 'text-ssf-text'}`}>
                        {s.items?.item_name_ml ?? s.items?.item_name_en ?? 'Unknown'}
                        {s.items?.category_codes ? ` - ${(s.items.category_codes as string[]).join(', ')}` : ''}
                      </Text>
                      <Text className="font-poppins text-xs text-ssf-text-muted mt-0.5">
                        {s.venues?.name} · {new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {errorMessage && (
                  <View className="bg-red-50 p-3 rounded-xl mb-3 border border-red-100">
                    <Text className="font-poppins text-red-600 text-sm">{errorMessage}</Text>
                  </View>
                )}

                <SsfButton
                  label="🔑 Generate One-Time Code"
                  onPress={handleGenerateToken}
                  isLoading={isGenerating}
                  disabled={!selectedScheduleId}
                  className="mb-3"
                />
                <SsfButton label="Cancel" variant="outline" onPress={() => setIsTokenModalOpen(false)} />
              </>
            ) : (
              <>
                <View className="bg-gray-50 rounded-2xl p-5 items-center mb-5 border border-gray-200">
                  <Text className="font-poppins text-gray-500 text-xs mb-2">One-Time Access Code</Text>
                  <Text className="font-poppins-black text-4xl text-ssf-primary tracking-widest mb-2">{generatedToken}</Text>
                  <Text className="font-poppins text-gray-400 text-xs text-center">Share this code with the judge.{'\n'}It expires after single use.</Text>
                </View>

                <View className="flex-row gap-x-3 mb-3">
                  <TouchableOpacity onPress={copyToken} className="flex-1 flex-row items-center justify-center gap-x-2 bg-gray-100 rounded-xl py-3">
                    <Copy size={16} color="#374151" />
                    <Text className="font-poppins-bold text-gray-700 text-sm">Copy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={shareToken} className="flex-1 flex-row items-center justify-center gap-x-2 bg-ssf-primary rounded-xl py-3">
                    <Share2 size={16} color="#FFF" />
                    <Text className="font-poppins-bold text-white text-sm">Share</Text>
                  </TouchableOpacity>
                </View>

                <SsfButton label="Done" variant="outline" onPress={() => setIsTokenModalOpen(false)} />
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
