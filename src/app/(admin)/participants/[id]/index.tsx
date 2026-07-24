import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Platform, Image, Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGoBack } from '../../../../core/hooks/useGoBack';
import { SsfCard } from '../../../../components/ui/SsfCard';
import { SsfButton } from '../../../../components/ui/SsfButton';
import { useParticipants } from '../../../../core/hooks/useParticipants';
import { ArrowLeft, Lock, Unlock, Edit3, Trash2, User, AlertTriangle, Plus, Eye, EyeOff, ExternalLink } from 'lucide-react-native';
import { useFestival } from '../../../../core/hooks/useFestival';
import { useAuthStore } from '../../../../core/store/authStore';
import { CATEGORIES } from '../../../../constants/categories';
export default function ParticipantDetails() {
  const { id } = useLocalSearchParams();
  const participantId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const goBack = useGoBack('/(admin)/participants');
  
  const {
    participant,
    isLoadingDetail,
    registrations: events,
    updateStatus,
    updateParticipant,
    uploadProfilePhoto,
    removeProfilePhoto,
    deleteParticipant,
    isUpdatingParticipant,
    isUploadingProfilePhoto,
    isRemovingProfilePhoto,
    registerParticipant,
    isRegistering
  } = useParticipants(participantId);

  const { useActiveFestival, useItems } = useFestival();
  const { data: festival } = useActiveFestival();
  const { data: allItems } = useItems(festival?.id);
  const { tenant_id } = useAuthStore();

  const [isEditing, setIsEditing] = useState(false);
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [selectedItemCode, setSelectedItemCode] = useState<string>('');
  const [addEventError, setAddEventError] = useState<string>('');
  
  // Custom dropdown state
  const [isItemDropdownOpen, setIsItemDropdownOpen] = useState(false);
  const [itemSearchText, setItemSearchText] = useState('');

  // Editable fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [gender, setGender] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [profileSlug, setProfileSlug] = useState('');
  const [publicProfileEnabled, setPublicProfileEnabled] = useState(true);
  const [showOrganisationPublic, setShowOrganisationPublic] = useState(true);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [isGenderDropdownOpen, setIsGenderDropdownOpen] = useState(false);

  // Update local state when participant data loads
  useEffect(() => {
    if (participant) {
      setName(participant.name || '');
      setEmail(participant.email || '');
      setPhone(participant.phone || '');
      setDob(participant.dob || '');
      setCategoryCode(participant.category_code || '');
      setGender(participant.gender || '');
      setProfileBio(participant.profile_bio || '');
      setPhotoUrl(participant.photo_url || '');
      setProfileSlug(participant.profile_slug || '');
      setPublicProfileEnabled(participant.public_profile_enabled !== false);
      setShowOrganisationPublic(participant.show_organisation_public !== false);
    }
  }, [participant]);

  const toggleLock = async () => {
    if (!participant || !participantId) return;
    try {
      await updateParticipant({ id: participantId, updates: { is_locked: !participant.is_locked } });
      if (!participant.is_locked) setIsEditing(false);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleSave = async () => {
    if (!name) return Alert.alert('Error', 'Name is required');
    if (!participantId) return;

    try {
      await updateParticipant({ 
        id: participantId, 
        updates: {
          name, 
          email: email || null, 
          phone: phone || null, 
          dob: dob || null,
          category_code: categoryCode || null,
          gender: gender || null,
          photo_url: photoUrl || null,
          profile_bio: profileBio || null,
          profile_slug: profileSlug || null,
          public_profile_enabled: publicProfileEnabled,
          show_organisation_public: showOrganisationPublic,
        }
      });
      setIsEditing(false);
      Alert.alert('Success', 'Participant updated.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleDelete = async () => {
    if (!participantId) return;
    const msg = 'Are you sure you want to delete this participant?';
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) {
        try {
          await deleteParticipant(participantId);
          goBack();
        } catch (error: any) {
          window.alert(error.message);
        }
      }
    } else {
      Alert.alert('Confirm Delete', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await deleteParticipant(participantId);
              goBack();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
        }}
      ]);
    }
  };

  const handlePhotoUpload = () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Upload unavailable', 'Photo upload is available from the web admin panel. You can still paste a public image URL.');
      return;
    }
    if (!festival?.id || !tenant_id) {
      Alert.alert('Error', 'Festival and tenant context are required before uploading.');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setIsUploadingPhoto(true);
      try {
        const updated = await uploadProfilePhoto({
          id: participantId!,
          file,
          tenantId: tenant_id,
          festivalId: festival.id,
        });
        setPhotoUrl(updated.photo_url || '');
      } catch (error: any) {
        Alert.alert('Upload failed', error.message);
      } finally {
        setIsUploadingPhoto(false);
      }
    };
    input.click();
  };

  const handlePhotoRemove = async () => {
    if (!participantId) return;
    try {
      const updated = await removeProfilePhoto(participantId);
      setPhotoUrl(updated.photo_url || '');
    } catch (error: any) {
      Alert.alert('Remove failed', error.message);
    }
  };

  const handleStatusUpdate = async (newStatus: string, reason: string | null = null) => {
    if (!participantId) return;
    try {
      await updateStatus({ id: participantId, status: newStatus as any, reason });
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const promptStatusChange = () => {
    if (participant.is_locked) return;
    if (isBanned && participant.status !== 'approved') {
       if (Platform.OS === 'web') {
         const newStatus = window.prompt(`Update status for ${participant.name} (pending/rejected):`, participant.status || 'pending');
         if (newStatus === 'rejected') {
           const reason = window.prompt('Enter rejection reason:');
           handleStatusUpdate('rejected', reason);
         } else if (newStatus === 'pending') {
           handleStatusUpdate('pending');
         } else if (newStatus === 'approved') {
           window.alert('Cannot approve a banned participant.');
         }
       } else {
         Alert.alert('Update Status', 'Participant is banned. Approval blocked.', [
           { text: 'Pending', onPress: () => handleStatusUpdate('pending') },
           { text: 'Reject', onPress: () => handleStatusUpdate('rejected', 'Plagiarism Ban'), style: 'destructive' },
           { text: 'Cancel', style: 'cancel' }
         ]);
       }
       return;
    }

    if (Platform.OS === 'web') {
      const newStatus = window.prompt(`Update status for ${participant.name} (pending/approved/rejected):`, participant.status || 'pending');
      if (newStatus === 'rejected') {
        const reason = window.prompt('Enter rejection reason:');
        handleStatusUpdate('rejected', reason);
      } else if (newStatus === 'approved') {
        handleStatusUpdate('approved', null);
      } else if (newStatus === 'pending') {
        handleStatusUpdate('pending', null);
      }
    } else {
      Alert.alert('Update Status', `Select new status for ${participant.name}`, [
        { text: 'Pending', onPress: () => handleStatusUpdate('pending', null) },
        { text: 'Approve', onPress: () => handleStatusUpdate('approved', null) },
        { text: 'Reject', onPress: () => handleStatusUpdate('rejected', 'Rejected by admin'), style: 'destructive' },
        { text: 'Cancel', style: 'cancel' }
      ]);
    }
  };

  const handleBan = async () => {
    if (Platform.OS === 'web') {
      const banUntil = window.prompt('Enter ban until date (YYYY-MM-DD) or leave empty to remove ban:', participant.plagiarism_ban_until || '');
      const newDate = banUntil ? new Date(banUntil).toISOString() : null;
      try {
        await updateParticipant({ id: participantId!, updates: { plagiarism_ban_until: newDate } });
      } catch (error: any) {
        window.alert(error.message);
      }
    }
  };

  const handleAddEvent = async () => {
    if (!selectedItemCode) return Alert.alert('Error', 'Please select an item');
    if (!participant || !festival) return;

    const selectedItem = allItems?.find((i: any) => i.item_code === selectedItemCode);
    if (!selectedItem) return;

    try {
      setAddEventError('');
      const { errors, warnings } = await registerParticipant({
        participant,
        item: selectedItem,
        festivalConfig: festival
      });

      if (errors && errors.length > 0) {
        const errorMsg = errors.map(e => `• ${e.message}`).join('\n');
        setAddEventError(errorMsg);
        Alert.alert('Registration Blocked', errorMsg);
        return;
      }

      if (warnings && warnings.length > 0) {
        const warningMsg = warnings.map(w => `• ${w.message}`).join('\n');
        setAddEventError(warningMsg);
        Alert.alert('Warning', warningMsg);
      } else {
        Alert.alert('Success', 'Participant registered successfully');
      }

      setIsAddingEvent(false);
      setSelectedItemCode('');
    } catch (error: any) {
      setAddEventError(error.message);
      Alert.alert('Error', error.message);
    }
  };

  if (isLoadingDetail) return <ActivityIndicator color="#1B6B3A" className="mt-10" />;

  if (!participant) {
    return (
      <View className="flex-1 bg-ssf-bg p-6 justify-center items-center">
        <Text className="font-poppins text-ssf-text">Participant not found.</Text>
        <SsfButton label="Go Back" onPress={goBack} className="mt-4" />
      </View>
    );
  }

  const locked = participant.is_locked;
  const isBanned = participant.plagiarism_ban_until && new Date(participant.plagiarism_ban_until) > new Date();

  const getStatusColor = (status: string) => {
    switch((status || 'pending').toLowerCase()) {
      case 'approved': return { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' };
      case 'rejected': return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' };
      default: return { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' };
    }
  };
  const statColor = getStatusColor(participant.status);

  return (
    <ScrollView className="flex-1 bg-ssf-bg py-6 px-4">
      <View className="flex-row items-center justify-between mb-6">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={goBack} className="mr-3 p-2 bg-ssf-surface rounded-full">
            <ArrowLeft size={24} color="#333" />
          </TouchableOpacity>
          <Text className="text-2xl font-poppins-black text-ssf-text">Profile</Text>
        </View>
        <TouchableOpacity 
          onPress={toggleLock}
          className={`flex-row items-center gap-x-2 px-3 py-2 rounded-xl border ${locked ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}
        >
          {locked ? <Lock size={16} color="#DC2626" /> : <Unlock size={16} color="#1B6B3A" />}
          <Text className={`font-poppins-bold ${locked ? 'text-red-600' : 'text-green-700'}`}>
            {locked ? 'Locked' : 'Unlocked'}
          </Text>
        </TouchableOpacity>
      </View>

      {isBanned && (
        <View className="bg-red-100 border border-red-300 rounded-xl p-4 mb-4 flex-row items-center gap-x-3">
          <AlertTriangle size={24} color="#DC2626" />
          <View className="flex-1">
            <Text className="font-poppins-bold text-red-700">Plagiarism Ban Active</Text>
            <Text className="font-poppins text-xs text-red-600">Banned until: {new Date(participant.plagiarism_ban_until).toLocaleDateString()}</Text>
          </View>
          <TouchableOpacity onPress={handleBan} className="bg-white px-3 py-1 rounded-lg border border-red-200">
            <Text className="font-poppins-bold text-xs text-red-700">Manage</Text>
          </TouchableOpacity>
        </View>
      )}

      <SsfCard className="mb-6">
        <View className="flex-row justify-between items-start mb-6">
          <View className="flex-row items-center gap-x-4">
            <View className="w-16 h-16 rounded-full bg-gray-100 border border-gray-200 items-center justify-center overflow-hidden">
              {participant.photo_url ? (
                <Image source={{ uri: participant.photo_url }} className="w-full h-full" resizeMode="cover" />
              ) : (
                <User size={32} color="#9CA3AF" />
              )}
            </View>
            <View>
              <Text className="text-sm font-poppins text-ssf-text-muted">Chest No.</Text>
              <Text className="text-2xl font-poppins-black">{participant.chest_number || 'N/A'}</Text>
              {participant.organisations && (
                <View className="mt-1 flex-row items-center gap-x-1 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full self-start">
                  <Text className="font-poppins-bold text-[10px] text-blue-700 uppercase">
                    {participant.organisations.name} · {participant.organisations.org_type}
                  </Text>
                </View>
              )}
              <TouchableOpacity 
                disabled={locked}
                onPress={promptStatusChange} 
                className={`mt-2 px-3 py-1 rounded-full border self-start ${statColor.bg} ${statColor.border}`}
              >
                <Text className={`font-poppins-bold text-[10px] uppercase ${statColor.text}`}>
                  {participant.status || 'Pending'}
               </Text>
              </TouchableOpacity>
            </View>
          </View>
          {!locked && !isEditing && (
             <TouchableOpacity className="p-2 bg-gray-50 rounded-full" onPress={() => setIsEditing(true)}>
               <Edit3 size={20} color="#666" />
             </TouchableOpacity>
          )}
        </View>

        {participant.status === 'rejected' && participant.rejection_reason && (
          <View className="bg-red-50 p-3 rounded-lg mb-4 border border-red-100">
            <Text className="font-poppins-bold text-xs text-red-700">Rejection Reason:</Text>
            <Text className="font-poppins text-sm text-red-600">{participant.rejection_reason}</Text>
          </View>
        )}

        {isEditing ? (
          <View className="gap-y-4 border-t border-gray-100 pt-4">
            <View>
              <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Name</Text>
              <TextInput className="border border-ssf-border rounded-xl p-3 font-poppins" value={name} onChangeText={setName} />
            </View>
            <View className="flex-row gap-x-3" style={{ zIndex: 50 }}>
              <View className="flex-1" style={{ zIndex: 50 }}>
                <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Category Code</Text>
                {Platform.OS === 'web' ? (
                  <View className="border border-ssf-border rounded-xl bg-white overflow-hidden">
                    <select 
                      style={{ width: '100%', padding: '12px', border: 'none', backgroundColor: 'transparent', outline: 'none', fontFamily: 'inherit', color: '#333' }}
                      value={categoryCode}
                      onChange={(e) => setCategoryCode(e.target.value)}
                    >
                      <option value="">-- Select Category --</option>
                      {CATEGORIES.map(cat => (
                        <option key={cat.code} value={cat.code}>
                          {cat.code} - {cat.name_en}
                        </option>
                      ))}
                      {!CATEGORIES.find(c => c.code === categoryCode) && categoryCode && (
                         <option value={categoryCode}>{categoryCode}</option>
                      )}
                    </select>
                  </View>
                ) : (
                  <View>
                    <TouchableOpacity 
                      className="border border-ssf-border rounded-xl p-3 bg-white flex-row justify-between items-center"
                      onPress={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                    >
                      <Text className={`font-poppins ${categoryCode ? 'text-ssf-text' : 'text-gray-400'}`}>
                        {categoryCode 
                          ? CATEGORIES.find(c => c.code === categoryCode)?.code + ' - ' + (CATEGORIES.find(c => c.code === categoryCode)?.name_en || '') 
                          : '-- Select Category --'}
                      </Text>
                    </TouchableOpacity>
                    
                    {isCategoryDropdownOpen && (
                      <View className="mt-1 border border-ssf-border rounded-xl bg-white overflow-hidden absolute top-full left-0 right-0 z-50 shadow-sm" style={{ maxHeight: 200 }}>
                        <ScrollView nestedScrollEnabled>
                          {CATEGORIES.map(cat => (
                            <TouchableOpacity 
                              key={cat.code}
                              className="p-3 border-b border-gray-100"
                              onPress={() => {
                                setCategoryCode(cat.code);
                                setIsCategoryDropdownOpen(false);
                              }}
                            >
                              <Text className="font-poppins text-ssf-text">
                                {cat.code} - {cat.name_en}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                )}
              </View>
              <View className="flex-1" style={{ zIndex: 40 }}>
                <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Gender (boys/girls)</Text>
                {Platform.OS === 'web' ? (
                  <View className="border border-ssf-border rounded-xl bg-white overflow-hidden">
                    <select 
                      style={{ width: '100%', padding: '12px', border: 'none', backgroundColor: 'transparent', outline: 'none', fontFamily: 'inherit', color: '#333' }}
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                    >
                      <option value="">-- Select --</option>
                      <option value="boys">Boys</option>
                      <option value="girls">Girls</option>
                    </select>
                  </View>
                ) : (
                  <View>
                    <TouchableOpacity 
                      className="border border-ssf-border rounded-xl p-3 bg-white flex-row justify-between items-center"
                      onPress={() => setIsGenderDropdownOpen(!isGenderDropdownOpen)}
                    >
                      <Text className={`font-poppins capitalize ${gender ? 'text-ssf-text' : 'text-gray-400'}`}>
                        {gender || '-- Select --'}
                      </Text>
                    </TouchableOpacity>
                    
                    {isGenderDropdownOpen && (
                      <View className="mt-1 border border-ssf-border rounded-xl bg-white overflow-hidden absolute top-full left-0 right-0 z-50 shadow-sm">
                        <TouchableOpacity 
                          className="p-3 border-b border-gray-100"
                          onPress={() => { setGender('boys'); setIsGenderDropdownOpen(false); }}
                        >
                          <Text className="font-poppins text-ssf-text">Boys</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          className="p-3"
                          onPress={() => { setGender('girls'); setIsGenderDropdownOpen(false); }}
                        >
                          <Text className="font-poppins text-ssf-text">Girls</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </View>
            <View>
              <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Date of Birth (YYYY-MM-DD)</Text>
              <TextInput className="border border-ssf-border rounded-xl p-3 font-poppins" value={dob} onChangeText={setDob} />
            </View>
            <View>
              <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Email</Text>
              <TextInput className="border border-ssf-border rounded-xl p-3 font-poppins" value={email} onChangeText={setEmail} keyboardType="email-address" />
            </View>
            <View>
              <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Phone</Text>
              <TextInput className="border border-ssf-border rounded-xl p-3 font-poppins" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            </View>
            <View className="border-t border-gray-100 pt-4 gap-y-4">
              <View className="flex-row items-center gap-x-2">
                <Eye size={18} color="#0B6BDB" />
                <Text className="font-poppins-bold text-base text-ssf-text">Public Candidate Profile</Text>
              </View>
              <View>
                <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Profile Photo URL</Text>
                <TextInput
                  className="border border-ssf-border rounded-xl p-3 font-poppins"
                  value={photoUrl}
                  onChangeText={setPhotoUrl}
                  placeholder="https://..."
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={handlePhotoUpload}
                  disabled={isUploadingPhoto || isUploadingProfilePhoto}
                  className="mt-2 self-start px-3 py-2 rounded-xl border border-blue-100 bg-blue-50"
                >
                  <Text className="font-poppins-bold text-xs text-blue-700">
                    {isUploadingPhoto ? 'Uploading...' : 'Upload Photo'}
                  </Text>
                </TouchableOpacity>
                {photoUrl ? (
                  <TouchableOpacity
                    onPress={handlePhotoRemove}
                    disabled={isRemovingProfilePhoto}
                    className="mt-2 self-start px-3 py-2 rounded-xl border border-red-100 bg-red-50"
                  >
                    <Text className="font-poppins-bold text-xs text-red-700">
                      {isRemovingProfilePhoto ? 'Removing...' : 'Remove Photo'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View>
                <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Public Slug</Text>
                <TextInput
                  className="border border-ssf-border rounded-xl p-3 font-poppins"
                  value={profileSlug}
                  onChangeText={setProfileSlug}
                  placeholder="candidate-name"
                  autoCapitalize="none"
                />
              </View>
              <View>
                <Text className="text-sm font-poppins text-ssf-text-muted mb-1">Public Bio</Text>
                <TextInput
                  className="border border-ssf-border rounded-xl p-3 font-poppins min-h-[96px]"
                  value={profileBio}
                  onChangeText={setProfileBio}
                  multiline
                  textAlignVertical="top"
                  placeholder="Short public-safe candidate bio"
                />
              </View>
              <View className="flex-row justify-between items-center bg-blue-50 border border-blue-100 rounded-xl p-3">
                <View className="flex-1 pr-3">
                  <Text className="font-poppins-bold text-sm text-ssf-text">Public profile enabled</Text>
                  <Text className="font-poppins text-xs text-ssf-text-muted">Allow this candidate profile to be opened publicly.</Text>
                </View>
                <Switch
                  value={publicProfileEnabled}
                  onValueChange={setPublicProfileEnabled}
                  trackColor={{ false: '#CBD5E1', true: '#B9EBD1' }}
                  thumbColor={publicProfileEnabled ? '#078B5A' : '#F8FAFC'}
                />
              </View>
              <View className="flex-row justify-between items-center bg-green-50 border border-green-100 rounded-xl p-3">
                <View className="flex-1 pr-3">
                  <Text className="font-poppins-bold text-sm text-ssf-text">Show organisation publicly</Text>
                  <Text className="font-poppins text-xs text-ssf-text-muted">Display organisation name on the public profile.</Text>
                </View>
                <Switch
                  value={showOrganisationPublic}
                  onValueChange={setShowOrganisationPublic}
                  trackColor={{ false: '#CBD5E1', true: '#B9EBD1' }}
                  thumbColor={showOrganisationPublic ? '#078B5A' : '#F8FAFC'}
                />
              </View>
            </View>
            <View className="flex-row gap-x-3 mt-2">
              <SsfButton label="Cancel" variant="outline" className="flex-1" onPress={() => setIsEditing(false)} />
              <SsfButton label={isUpdatingParticipant ? "Saving..." : "Save"} className="flex-1" onPress={handleSave} disabled={isUpdatingParticipant} />
            </View>
          </View>
        ) : (
          <View className="gap-y-3 border-t border-gray-100 pt-4">
             <Text className="font-poppins-bold text-lg">{participant.name}</Text>
             <View className="flex-row flex-wrap gap-y-2">
               <View className="w-1/2">
                 <Text className="font-poppins text-xs text-ssf-text-muted">Category</Text>
                 <Text className="font-poppins-bold text-sm">{participant.category_code || '-'}</Text>
               </View>
               <View className="w-1/2">
                 <Text className="font-poppins text-xs text-ssf-text-muted">Gender</Text>
                 <Text className="font-poppins-bold text-sm capitalize">{participant.gender || '-'}</Text>
               </View>
               <View className="w-1/2 mt-2">
                 <Text className="font-poppins text-xs text-ssf-text-muted">Age</Text>
                 <Text className="font-poppins-bold text-sm">{participant.age || '-'}</Text>
               </View>
               <View className="w-1/2 mt-2">
                 <Text className="font-poppins text-xs text-ssf-text-muted">DOB</Text>
                 <Text className="font-poppins-bold text-sm">{participant.dob || '-'}</Text>
               </View>
               <View className="w-1/2 mt-2">
                 <Text className="font-poppins text-xs text-ssf-text-muted">Class/Edu</Text>
                 <Text className="font-poppins-bold text-sm">{participant.class_std || participant.education_type || '-'}</Text>
               </View>
               <View className="w-1/2 mt-2">
                 <Text className="font-poppins text-xs text-ssf-text-muted">Phone</Text>
                 <Text className="font-poppins-bold text-sm">{participant.phone || '-'}</Text>
               </View>
             </View>
             {!isBanned && (
               <TouchableOpacity onPress={handleBan} className="mt-2 self-start">
                 <Text className="font-poppins text-xs text-red-600 underline">Add Plagiarism Ban</Text>
               </TouchableOpacity>
             )}
          </View>
        )}
      </SsfCard>

      <SsfCard className="mb-6">
        <View className="flex-row justify-between items-start mb-4">
          <View className="flex-row items-center gap-x-3 flex-1">
            <View className={`w-10 h-10 rounded-full items-center justify-center ${participant.public_profile_enabled === false ? 'bg-gray-100' : 'bg-green-50'}`}>
              {participant.public_profile_enabled === false ? (
                <EyeOff size={20} color="#64748B" />
              ) : (
                <Eye size={20} color="#078B5A" />
              )}
            </View>
            <View className="flex-1">
              <Text className="font-poppins-bold text-lg text-ssf-text">Public Candidate Profile</Text>
              <Text className="font-poppins text-xs text-ssf-text-muted">
                Public-safe projection for leaderboard, profiles, and future certificates.
              </Text>
            </View>
          </View>
          {participant.profile_slug && participant.public_profile_enabled !== false && (
            <TouchableOpacity
              onPress={() => router.push(`/candidate/${participant.profile_slug}` as any)}
              className="ml-3 px-3 py-2 rounded-xl border border-blue-100 bg-blue-50 flex-row items-center gap-x-2"
            >
              <ExternalLink size={15} color="#0B6BDB" />
              <Text className="font-poppins-bold text-xs text-blue-700">Open</Text>
            </TouchableOpacity>
          )}
        </View>
        <View className="gap-y-3">
          <View className="flex-row flex-wrap gap-y-3">
            <View className="w-1/2 pr-3">
              <Text className="font-poppins text-xs text-ssf-text-muted">Visibility</Text>
              <Text className={`font-poppins-bold text-sm ${participant.public_profile_enabled === false ? 'text-gray-500' : 'text-green-700'}`}>
                {participant.public_profile_enabled === false ? 'Disabled' : 'Enabled'}
              </Text>
            </View>
            <View className="w-1/2 pr-3">
              <Text className="font-poppins text-xs text-ssf-text-muted">Organisation</Text>
              <Text className={`font-poppins-bold text-sm ${participant.show_organisation_public === false ? 'text-gray-500' : 'text-green-700'}`}>
                {participant.show_organisation_public === false ? 'Hidden publicly' : 'Shown publicly'}
              </Text>
            </View>
            <View className="w-full pr-3">
              <Text className="font-poppins text-xs text-ssf-text-muted">Slug</Text>
              <Text className="font-poppins-bold text-sm text-ssf-text">{participant.profile_slug || 'Will be generated on save'}</Text>
            </View>
          </View>
          <View className="bg-ssf-surface border border-ssf-border rounded-xl p-3">
            <Text className="font-poppins text-xs text-ssf-text-muted mb-1">Public Bio</Text>
            <Text className="font-poppins text-sm text-ssf-text leading-5">
              {participant.profile_bio || 'No public bio added yet.'}
            </Text>
          </View>
        </View>
      </SsfCard>

      <SsfCard className="mb-6">
        <View className="flex-row justify-between items-center mb-3">
          <Text className="font-poppins-bold text-lg">Registered Events</Text>
          {!locked && !isBanned && (
            <TouchableOpacity 
              onPress={() => setIsAddingEvent(true)}
              className="bg-ssf-primary px-3 py-1.5 rounded-full flex-row items-center gap-x-1"
            >
              <Plus size={14} color="#FFF" />
              <Text className="font-poppins-bold text-xs text-white">Add</Text>
            </TouchableOpacity>
          )}
        </View>
        {events.length === 0 ? (
           <Text className="font-poppins text-ssf-text-muted">No events assigned yet.</Text>
        ) : (
           events.map((ev: any) => (
             <View key={ev.id} className="p-3 border-b border-ssf-border last:border-0 flex-row justify-between items-center">
                <View>
                  <Text className="font-poppins-bold">{ev.items?.item_name_en || 'Unknown Event'}</Text>
                  <Text className="font-poppins text-xs text-ssf-text-muted">{ev.level} Level</Text>
                </View>
             </View>
           ))
        )}
      </SsfCard>

      {!locked && (
        <SsfButton 
          label="Delete Participant" 
          variant="outline" 
          icon={<Trash2 size={16} color="#DC2626" />} 
          onPress={handleDelete}
        />
      )}

      {/* Add Event Modal */}
      {isAddingEvent && (
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 50, padding: 20 }}>
          <View style={{ backgroundColor: '#FFF', borderRadius: 16, width: '100%', maxWidth: 400, padding: 24 }}>
            <Text className="font-poppins-bold text-lg mb-4 text-ssf-text">Register for Event</Text>
            
            {addEventError ? (
              <View className="bg-red-50 p-3 rounded-lg mb-4 border border-red-100">
                <Text className="font-poppins-bold text-xs text-red-700">Error:</Text>
                <Text className="font-poppins text-sm text-red-600">{addEventError}</Text>
              </View>
            ) : null}

            <View className="mb-4" style={{ position: 'relative', zIndex: 100 }}>
              <Text className="font-poppins text-xs text-ssf-text-muted mb-2">Select Item</Text>
              <View className="border border-ssf-border rounded-xl bg-ssf-surface overflow-hidden">
                <TextInput
                  placeholder="-- Choose an Item --"
                  value={isItemDropdownOpen ? itemSearchText : (selectedItemCode ? (() => {
                    const sel = allItems?.find((i: any) => i.item_code === selectedItemCode);
                    return sel ? `[${sel.item_code}] ${sel.item_name_en}` : '';
                  })() : '')}
                  onChangeText={(text) => {
                    setItemSearchText(text);
                    if (!isItemDropdownOpen) setIsItemDropdownOpen(true);
                  }}
                  onFocus={() => {
                    setIsItemDropdownOpen(true);
                    setItemSearchText('');
                  }}
                  className="p-3 font-poppins text-ssf-text text-sm"
                />
              </View>
              
              {isItemDropdownOpen && (
                <View className="absolute top-full left-0 right-0 mt-1 border border-ssf-border rounded-xl bg-white shadow-lg overflow-hidden" style={{ maxHeight: 250, zIndex: 999 }}>
                  <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {allItems?.filter(i => {
                      const codes = Array.isArray(i.category_codes) ? i.category_codes : (i.category_codes ? [i.category_codes] : []);
                      
                      const pCat = participant.category_code;
                      const pCatShort = pCat === 'SENIOR' ? 'SR' : (pCat === 'JUNIOR' ? 'JR' : (pCat === 'CAMPUS' ? 'CA' : pCat));
                      const pCatLong = pCat === 'SR' ? 'SENIOR' : (pCat === 'JR' ? 'JUNIOR' : (pCat === 'CA' ? 'CAMPUS' : pCat));

                      const matchesCategory = codes.includes(pCat) || codes.includes(pCatShort) || codes.includes(pCatLong) || codes.includes('GN');
                      const matchesGender = !i.gender || i.gender === 'both' || i.gender === participant.gender;
                      
                      if (!itemSearchText) return matchesCategory && matchesGender;
                      
                      const search = itemSearchText.toLowerCase();
                      const name = (i.item_name_en || '').toLowerCase();
                      const code = (i.item_code || '').toLowerCase();
                      const cats = codes.join(' ').toLowerCase();
                      const matchesSearch = name.includes(search) || code.includes(search) || cats.includes(search);
                      
                      return matchesCategory && matchesGender && matchesSearch;
                    }).map(i => (
                      <TouchableOpacity
                        key={i.item_code}
                        className="p-3 border-b border-gray-100 last:border-0"
                        onPress={() => {
                          setSelectedItemCode(i.item_code);
                          setAddEventError('');
                          setIsItemDropdownOpen(false);
                          setItemSearchText('');
                        }}
                      >
                        <Text className="font-poppins text-ssf-text">
                          [{i.item_code}] {i.item_name_en} ({Array.isArray(i.category_codes) ? i.category_codes.join(',') : i.category_codes})
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {allItems?.filter(i => {
                      const codes = Array.isArray(i.category_codes) ? i.category_codes : (i.category_codes ? [i.category_codes] : []);
                      const pCat = participant.category_code;
                      const pCatShort = pCat === 'SENIOR' ? 'SR' : (pCat === 'JUNIOR' ? 'JR' : (pCat === 'CAMPUS' ? 'CA' : pCat));
                      const pCatLong = pCat === 'SR' ? 'SENIOR' : (pCat === 'JR' ? 'JUNIOR' : (pCat === 'CA' ? 'CAMPUS' : pCat));
                      const matchesCategory = codes.includes(pCat) || codes.includes(pCatShort) || codes.includes(pCatLong) || codes.includes('GN');
                      const matchesGender = !i.gender || i.gender === 'both' || i.gender === participant.gender;
                      if (!itemSearchText) return matchesCategory && matchesGender;
                      const search = itemSearchText.toLowerCase();
                      const name = (i.item_name_en || '').toLowerCase();
                      const code = (i.item_code || '').toLowerCase();
                      const cats = codes.join(' ').toLowerCase();
                      const matchesSearch = name.includes(search) || code.includes(search) || cats.includes(search);
                      return matchesCategory && matchesGender && matchesSearch;
                    }).length === 0 && (
                      <View className="p-3">
                        <Text className="font-poppins text-ssf-text-muted text-sm">No items found</Text>
                      </View>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>

            <View className="flex-row gap-x-3">
              <SsfButton label="Cancel" variant="outline" className="flex-1" onPress={() => { setIsAddingEvent(false); setAddEventError(''); }} />
              <SsfButton label={isRegistering ? "Wait..." : "Register"} className="flex-1" onPress={handleAddEvent} disabled={isRegistering || !selectedItemCode} />
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
