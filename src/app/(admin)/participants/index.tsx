import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { SsfCard } from '../../../components/ui/SsfCard';
import { useParticipants } from '../../../core/hooks/useParticipants';
import { UserPlus, ChevronRight, Upload, CheckSquare, Square, X, Search, FileDown, CheckCircle, Trash2, GitCompare } from 'lucide-react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

export default function ParticipantsList() {
  const router = useRouter();
  
  const {
    participants,
    isLoadingList,
    updateStatus,
    deleteMultiple,
    approveMultiple,
    isDeleting,
    isApprovingMultiple
  } = useParticipants();

  // Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedGender, setSelectedGender] = useState<string>('All');

  const categories = ['All', 'LP', 'UP', 'HS', 'HSS', 'JUNIOR', 'SENIOR', 'CAMPUS', 'GENERAL'];
  const statuses = ['All', 'Pending', 'Approved', 'Rejected'];
  const genders = ['All', 'Boys', 'Girls'];

  // Bulk action state
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const processingBulk = isDeleting || isApprovingMultiple;

  const filteredParticipants = participants.filter((p: any) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.chest_number && p.chest_number.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCat = selectedCategory === 'All' || p.category_code === selectedCategory;
    const matchesStatus = selectedStatus === 'All' || (p.status || 'pending').toLowerCase() === selectedStatus.toLowerCase();
    const matchesGender = selectedGender === 'All' || (p.gender || '').toLowerCase() === selectedGender.toLowerCase();

    return matchesSearch && matchesCat && matchesStatus && matchesGender;
  });

  const exportToExcel = async () => {
    if (filteredParticipants.length === 0) {
      if (Platform.OS === 'web') window.alert('No data to export');
      else Alert.alert('No Data', 'No participants found to export.');
      return;
    }

    const data = filteredParticipants.map((p: any) => ({
      'Name': p.name,
      'Chest Number': p.chest_number || '-',
      'Category': p.category_code || '-',
      'Gender': p.gender || '-',
      'Age': p.age || '-',
      'Status': (p.status || 'pending').toUpperCase(),
      'Registered By': p.registered_by || '-',
      'Created At': new Date(p.created_at).toLocaleDateString()
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Participants");

    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const filename = `Participants_${new Date().getTime()}.xlsx`;

    if (Platform.OS === 'web') {
      const uri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
      const link = document.createElement('a');
      link.href = uri;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const fileUri = FileSystem.documentDirectory + filename;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Error', 'Sharing not available on this device');
      }
    }
  };

  const updateSingleStatus = async (id: string, newStatus: string) => {
    try {
      await updateStatus({ id, status: newStatus as any, reason: null });
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert('Status update failed: ' + error.message);
      else Alert.alert('Error', error.message);
    }
  };

  const promptStatusChange = (p: any) => {
    if (Platform.OS === 'web') {
      const newStatus = window.prompt(`Update status for ${p.name} (pending/approved/rejected):`, p.status || 'pending');
      if (newStatus && ['pending', 'approved', 'rejected'].includes(newStatus.toLowerCase())) {
        updateSingleStatus(p.id, newStatus.toLowerCase());
      }
    } else {
      Alert.alert('Update Status', `Select new status for ${p.name}`, [
        { text: 'Pending', onPress: () => updateSingleStatus(p.id, 'pending') },
        { text: 'Approve', onPress: () => updateSingleStatus(p.id, 'approved') },
        { text: 'Reject', onPress: () => updateSingleStatus(p.id, 'rejected'), style: 'destructive' },
        { text: 'Cancel', style: 'cancel' }
      ]);
    }
  };

  const getStatusColor = (status: string) => {
    switch ((status || 'pending').toLowerCase()) {
      case 'approved': return { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' };
      case 'rejected': return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' };
      default: return { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' };
    }
  };

  const toggleSelectMode = () => {
    setSelectMode(prev => !prev);
    setSelected(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(filteredParticipants.map((p: any) => p.id)));

  const bulkUpdateAction = async (action: 'delete' | 'approve') => {
    const ids = Array.from(selected);
    try {
      if (action === 'delete') {
        await deleteMultiple(ids);
      } else {
        await approveMultiple(ids);
      }
      setSelected(new Set());
      setSelectMode(false);
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert('Action failed: ' + error.message);
      else Alert.alert('Error', error.message);
    }
  };

  const confirmBulkAction = (action: 'delete' | 'approve') => {
    if (selected.size === 0) return;
    const msg = action === 'delete'
      ? `Delete ${selected.size} selected participant(s)? This cannot be undone.`
      : `Approve ${selected.size} selected participant(s)?`;

    if (Platform.OS === 'web') {
      if (window.confirm(msg)) bulkUpdateAction(action);
    } else {
      Alert.alert('Confirm', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: action === 'delete' ? 'Delete' : 'Approve', style: action === 'delete' ? 'destructive' : 'default', onPress: () => bulkUpdateAction(action) },
      ]);
    }
  };

  const FilterList = ({ items, selectedValue, onSelect }: { items: string[], selectedValue: string, onSelect: (v: string) => void }) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-2">
      {items.map(item => (
        <TouchableOpacity
          key={item}
          onPress={() => onSelect(item)}
          className={`px-4 py-1.5 rounded-full mr-2 border ${selectedValue === item
              ? 'bg-ssf-primary border-ssf-primary'
              : 'bg-white border-ssf-border'
            }`}
        >
          <Text className={`font-poppins-bold text-xs ${selectedValue === item ? 'text-white' : 'text-ssf-text-muted'}`}>
            {item}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  return (
    <ScrollView className="flex-1 bg-ssf-bg py-6 px-4" stickyHeaderIndices={[1]}>
      {/* Header */}
      <View className="flex-row justify-between items-center mb-4">
        <View>
          <Text className="text-3xl font-poppins-black text-ssf-text">Participants</Text>
          <Text className="text-sm font-poppins text-ssf-text-muted mt-1">{filteredParticipants.length} showing</Text>
        </View>
        <View className="flex-row gap-x-2">
          <TouchableOpacity onPress={() => router.push('/(admin)/participants/chest-numbers')} className="p-2 bg-white border border-ssf-border rounded-lg flex-row items-center gap-x-1">
            <Text className="font-poppins-bold text-ssf-primary text-xs hidden sm:flex">Numbers</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(admin)/participants/chest-cards' as any)}
            className="p-2 bg-white border border-ssf-border rounded-lg flex-row items-center gap-x-1"
          >
            <Text className="font-poppins-bold text-ssf-primary text-xs">🪪 Cards</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(admin)/participants/manage-units' as any)}
            className="p-2 bg-white border border-ssf-border rounded-lg flex-row items-center gap-x-1"
          >
            <GitCompare size={14} color="#1B6B3A" />
            <Text className="font-poppins-bold text-ssf-primary text-xs">Reassign</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={exportToExcel} className="p-2 bg-white border border-ssf-border rounded-lg">
            <FileDown size={20} color="#1B6B3A" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(admin)/participants/import')} className="p-2 bg-white border border-ssf-border rounded-lg">
            <Upload size={20} color="#1B6B3A" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(admin)/participants/import-json' as any)} className="p-2 bg-orange-50 border border-orange-200 rounded-lg flex-row items-center gap-x-1">
            <Text className="font-poppins-bold text-orange-700 text-xs">JR Import</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(admin)/participants/import-up' as any)} className="p-2 bg-blue-50 border border-blue-200 rounded-lg flex-row items-center gap-x-1">
            <Text className="font-poppins-bold text-blue-700 text-xs">UP Import</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(admin)/participants/import-senior' as any)} className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg flex-row items-center gap-x-1">
            <Text className="font-poppins-bold text-emerald-700 text-xs">SR Import</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(admin)/participants/import-lp' as any)} className="p-2 bg-indigo-50 border border-indigo-200 rounded-lg flex-row items-center gap-x-1">
            <Text className="font-poppins-bold text-indigo-700 text-xs">LP Import</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(admin)/participants/import-hs' as any)} className="p-2 bg-purple-50 border border-purple-200 rounded-lg flex-row items-center gap-x-1">
            <Text className="font-poppins-bold text-purple-700 text-xs">HS Import</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(admin)/participants/import-hss' as any)} className="p-2 bg-pink-50 border border-pink-200 rounded-lg flex-row items-center gap-x-1">
            <Text className="font-poppins-bold text-pink-700 text-xs">HSS Import</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(admin)/participants/import-general' as any)} className="p-2 bg-yellow-50 border border-yellow-200 rounded-lg flex-row items-center gap-x-1">
            <Text className="font-poppins-bold text-yellow-700 text-xs">GEN Import</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(admin)/participants/add')} className="p-2 bg-ssf-primary border border-ssf-primary rounded-lg flex-row items-center gap-x-2">
            <UserPlus size={20} color="white" />
            <Text className="font-poppins-bold text-white text-xs hidden sm:flex">Add New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sticky Filters & Search */}
      <View className="bg-ssf-bg pb-4 z-10">
        <View className="flex-row items-center bg-white border border-ssf-border rounded-xl px-4 py-2 mb-3">
          <Search size={18} color="#9CA3AF" />
          <TextInput
            className="flex-1 ml-2 font-poppins text-ssf-text outline-none"
            placeholder="Search by name or chest number..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        <FilterList items={categories} selectedValue={selectedCategory} onSelect={setSelectedCategory} />
        <FilterList items={statuses} selectedValue={selectedStatus} onSelect={setSelectedStatus} />
        <FilterList items={genders} selectedValue={selectedGender} onSelect={setSelectedGender} />
      </View>

      {/* Bulk action bar */}
      <View className="flex-row items-center justify-between mb-4 mt-2">
        {!selectMode ? (
          <TouchableOpacity onPress={toggleSelectMode} className="flex-row items-center gap-x-2 px-3 py-2 bg-white border border-ssf-border rounded-lg">
            <CheckSquare size={16} color="#1B6B3A" />
            <Text className="font-poppins-bold text-xs text-ssf-primary">Select Multiple</Text>
          </TouchableOpacity>
        ) : (
          <View className="flex-1 flex-row items-center justify-between bg-white px-3 py-2 border border-ssf-border rounded-lg">
            <View className="flex-row items-center gap-x-3">
              <TouchableOpacity onPress={toggleSelectMode} className="p-1">
                <X size={18} color="#666" />
              </TouchableOpacity>
              <Text className="font-poppins-bold text-ssf-text">{selected.size} selected</Text>
              <TouchableOpacity onPress={selectAll}>
                <Text className="font-poppins text-xs text-ssf-primary">All</Text>
              </TouchableOpacity>
            </View>
            <View className="flex-row gap-x-2">
              <TouchableOpacity onPress={() => confirmBulkAction('delete')} disabled={processingBulk || selected.size === 0} className={`p-2 rounded-lg ${selected.size > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                <Trash2 size={16} color={selected.size > 0 ? '#DC2626' : '#9CA3AF'} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmBulkAction('approve')} disabled={processingBulk || selected.size === 0} className={`flex-row items-center gap-x-1 px-3 py-2 rounded-lg ${selected.size > 0 ? 'bg-ssf-primary' : 'bg-gray-200'}`}>
                {processingBulk ? <ActivityIndicator color="white" size="small" /> : <CheckCircle size={16} color={selected.size > 0 ? 'white' : '#9CA3AF'} />}
                <Text className={`font-poppins-bold text-xs ${selected.size > 0 ? 'text-white' : 'text-gray-400'}`}>Approve</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* List */}
      <SsfCard className="mb-20">
        {isLoadingList ? (
          <ActivityIndicator color="#1B6B3A" className="my-10" />
        ) : filteredParticipants.length === 0 ? (
          <View className="items-center justify-center py-10">
            <Text className="text-ssf-text-muted font-poppins mb-4">No participants found.</Text>
          </View>
        ) : (
          <View className="gap-y-3">
            {filteredParticipants.map((p: any, index: number) => {
              const isSelected = selected.has(p.id);
              const statColor = getStatusColor(p.status);

              return (
                <Animated.View key={p.id} entering={FadeInUp.delay((index % 10) * 50)}>
                  <TouchableOpacity
                    className={`flex-row items-center justify-between p-3 border rounded-xl ${isSelected ? 'bg-green-50 border-green-300' : 'bg-ssf-surface border-ssf-border'
                      }`}
                    onPress={() => selectMode ? toggleSelect(p.id) : router.push(`/(admin)/participants/${p.id}`)}
                    onLongPress={() => {
                      if (!selectMode) setSelectMode(true);
                      toggleSelect(p.id);
                    }}
                  >
                    {selectMode && (
                      <View className="mr-3">
                        {isSelected ? <CheckSquare size={20} color="#1B6B3A" /> : <Square size={20} color="#9CA3AF" />}
                      </View>
                    )}

                    <View className="flex-1">
                      <View className="flex-row items-center gap-x-2">
                        <Text className="font-poppins-bold text-ssf-text text-base">{p.name}</Text>
                        <TouchableOpacity onPress={() => promptStatusChange(p)} className={`px-2 py-0.5 rounded-full border ${statColor.bg} ${statColor.border}`}>
                          <Text className={`font-poppins-bold text-[9px] uppercase ${statColor.text}`}>
                            {p.status || 'Pending'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <Text className="font-poppins text-xs text-ssf-text-muted mt-1">
                        {p.chest_number ? `No: ${p.chest_number}` : 'No Chest No.'} • Cat: {p.category_code} {p.gender ? `• ${p.gender === 'boys' ? 'B' : 'G'}` : ''}
                      </Text>
                      {p.organisations && (
                        <Text className="font-poppins text-[10px] text-blue-600 mt-0.5">
                          🏠 {p.organisations.name} ({p.organisations.org_type})
                        </Text>
                      )}
                    </View>

                    {!selectMode && (
                      <View className="ml-2 flex-row items-center gap-x-3">
                        {p.profile_slug && (
                          <TouchableOpacity 
                            onPress={(e) => {
                              e.stopPropagation();
                              router.push(`/candidate/${p.profile_slug}` as any);
                            }}
                            className="bg-emerald-50 px-3 py-1.5 rounded border border-emerald-200"
                          >
                            <Text className="text-[10px] font-poppins-bold text-emerald-700">Public Profile</Text>
                          </TouchableOpacity>
                        )}
                        <ChevronRight size={20} color="#9CA3AF" />
                      </View>
                    )}
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        )}
      </SsfCard>
    </ScrollView>
  );
}
