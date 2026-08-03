import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { SsfButton } from '../../../components/ui/SsfButton';
import { SsfInput } from '../../../components/ui/SsfInput';
import { useOrganisations } from '../../../core/hooks/useOrganisations';
import { ArrowLeft, Plus, Building2, KeyRound, User, Trash2, ExternalLink } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SsfTableSkeleton } from '../../../components/ui/SsfSkeleton';

export default function SubOrganisationsManager() {
  const router = useRouter();
  
  const { 
    childOrganisations: orgs, 
    isLoadingChildren: loading, 
    createOrganisation, 
    isCreating, 
    deleteOrganisation,
    generateCredentials 
  } = useOrganisations();

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleDeleteOrg = (org: any) => {
    const msg = `Delete "${org.name}"? This will permanently remove the account and all its data.`;
    const doDelete = async () => {
      try {
        await deleteOrganisation(org.id);
      } catch (err: any) {
        if (Platform.OS === 'web') window.alert('Delete failed: ' + err.message);
        else Alert.alert('Error', err.message);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doDelete();
    } else {
      Alert.alert('Delete Sub-Org', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleCreate = async () => {
    if (!newOrgName.trim()) {
      setErrorMsg('Please enter the organisation name.');
      return;
    }
    
    setErrorMsg('');

    try {
      await createOrganisation({ orgName: newOrgName, orgType: 'unit' });
      setModalVisible(false);
      setNewOrgName('');
      if (Platform.OS === 'web') window.alert('Unit created securely with auto-generated credentials!');
      else Alert.alert('Success', 'Unit created securely with auto-generated credentials!');
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const currentCreds = generateCredentials(newOrgName);

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <Animated.View entering={FadeInDown.duration(400)} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
          
          <View style={{ padding: 20, paddingTop: Platform.OS === 'web' ? 40 : 60 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <ArrowLeft size={20} color="#0F172A" />
                </TouchableOpacity>
                <View>
                  <Text style={{ color: '#64748B', fontFamily: 'Poppins_400Regular', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>Hierarchy Management</Text>
                  <Text style={{ color: '#0F172A', fontFamily: 'Poppins_900Black', fontSize: 22, lineHeight: 26 }}>Sub-Organisations</Text>
                </View>
              </View>
              <SsfButton 
                label="Add New" 
                size="sm" 
                icon={<Plus size={16} color="#fff" />} 
                onPress={() => { setNewOrgName(''); setErrorMsg(''); setModalVisible(true); }} 
              />
            </View>
          </View>

          <View style={{ paddingHorizontal: 20 }}>
            {loading ? (
              <SsfTableSkeleton rows={6} columns={3} compact />
            ) : orgs.length === 0 ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 60, opacity: 0.5 }}>
                <Building2 size={48} color="#64748B" />
                <Text style={{ fontFamily: 'Poppins_400Regular', color: '#64748B', marginTop: 16 }}>No sub-organisations found.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ flexGrow: 1 }}>
                <View style={{ minWidth: 920, flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D8E0EA', borderRadius: 14, overflow: 'hidden' }}>
                  <View style={{ height: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderBottomWidth: 1, borderBottomColor: '#D8E0EA' }}>
                    <Text style={{ flex: 1.6, fontFamily: 'Poppins_700Bold', fontSize: 10, color: '#64748B', letterSpacing: 1, textTransform: 'uppercase' }}>Organisation</Text>
                    <Text style={{ flex: 1.5, fontFamily: 'Poppins_700Bold', fontSize: 10, color: '#64748B', letterSpacing: 1, textTransform: 'uppercase' }}>User ID</Text>
                    <Text style={{ flex: 1, fontFamily: 'Poppins_700Bold', fontSize: 10, color: '#64748B', letterSpacing: 1, textTransform: 'uppercase' }}>Access Key</Text>
                    <Text style={{ width: 100, fontFamily: 'Poppins_700Bold', fontSize: 10, color: '#64748B', letterSpacing: 1, textTransform: 'uppercase' }}>Type</Text>
                    <Text style={{ width: 120, textAlign: 'right', fontFamily: 'Poppins_700Bold', fontSize: 10, color: '#64748B', letterSpacing: 1, textTransform: 'uppercase' }}>Actions</Text>
                  </View>

                  {orgs.map((org: any) => (
                    <View key={org.id} style={{ minHeight: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF' }}>
                      <View style={{ flex: 1.6, flexDirection: 'row', alignItems: 'center', paddingRight: 16 }}>
                        <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                          <Building2 size={15} color="#0F766E" />
                        </View>
                        <Text numberOfLines={1} style={{ flex: 1, fontFamily: 'Poppins_700Bold', fontSize: 13, color: '#0F172A' }}>{org.name}</Text>
                      </View>
                      <View style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center', paddingRight: 16 }}>
                        <User size={13} color="#0F766E" />
                        <Text numberOfLines={1} style={{ marginLeft: 7, fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#475569' }}>{org.admin_email || '—'}</Text>
                      </View>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingRight: 16 }}>
                        <KeyRound size={13} color="#B45309" />
                        <Text numberOfLines={1} style={{ marginLeft: 7, fontFamily: 'Poppins_700Bold', fontSize: 12, color: '#92400E' }}>{org.admin_password_temp || '—'}</Text>
                      </View>
                      <View style={{ width: 100, alignItems: 'flex-start' }}>
                        <View style={{ backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 }}>
                          <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 9, color: '#0F766E', textTransform: 'uppercase' }}>{org.org_type || 'UNIT'}</Text>
                        </View>
                      </View>
                      <View style={{ width: 120, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => router.push(`/unit-profile/${org.id}`)}
                          accessibilityLabel={`Open ${org.name}`}
                          style={{ width: 34, height: 34, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE' }}
                        >
                          <ExternalLink size={15} color="#2563EB" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteOrg(org)}
                          accessibilityLabel={`Delete ${org.name}`}
                          style={{ width: 34, height: 34, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' }}
                        >
                          <Trash2 size={15} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        </ScrollView>
      </Animated.View>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 }}>
            <Text style={{ fontFamily: 'Poppins_900Black', fontSize: 20, color: '#0F172A', marginBottom: 20 }}>Create Sub-Organisation</Text>
            
            <Text style={{ color: '#64748B', fontFamily: 'Poppins_400Regular', fontSize: 13, marginBottom: 8 }}>
              Enter the name of the new organisation. The system will automatically generate a secure User ID and Password for them.
            </Text>

            <SsfInput 
              label="Organisation Name (e.g. Unit Makkaraparamba)" 
              value={newOrgName} 
              onChangeText={setNewOrgName} 
              style={{ marginBottom: 20 }}
            />

            {newOrgName.trim().length > 0 && (
              <View style={{ backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed' }}>
                <Text style={{ fontFamily: 'Poppins_700Bold', color: '#0F172A', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Auto-Generated Credentials</Text>
                
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <User size={14} color="#065F46" />
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: '#333' }}>ID: <Text style={{ fontFamily: 'Poppins_700Bold', color: '#065F46' }}>{currentCreds.id}</Text></Text>
                </View>
                
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <KeyRound size={14} color="#B45309" />
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: '#333' }}>Pass: <Text style={{ fontFamily: 'Poppins_700Bold', color: '#B45309' }}>{currentCreds.pass}</Text></Text>
                </View>
              </View>
            )}

            {errorMsg ? (
              <Text style={{ color: '#DC2626', fontFamily: 'Poppins_400Regular', marginBottom: 16, fontSize: 13 }}>⚠️ {errorMsg}</Text>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <SsfButton 
                label="Cancel" 
                variant="outline" 
                style={{ flex: 1 }} 
                onPress={() => { setModalVisible(false); setErrorMsg(''); setNewOrgName(''); }} 
                disabled={isCreating}
              />
              <SsfButton 
                label={isCreating ? "Creating..." : "Create Account"} 
                variant="primary" 
                style={{ flex: 1 }} 
                onPress={handleCreate} 
                disabled={isCreating || !newOrgName.trim()}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
