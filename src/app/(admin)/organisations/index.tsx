import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { SsfInput } from '../../../components/ui/SsfInput';
import { useOrganisations } from '../../../core/hooks/useOrganisations';
import { ArrowLeft, Plus, Building2, KeyRound, User, Trash2, ExternalLink } from 'lucide-react-native';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';

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
              <ActivityIndicator color="#065F46" size="large" style={{ marginTop: 40 }} />
            ) : orgs.length === 0 ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 60, opacity: 0.5 }}>
                <Building2 size={48} color="#64748B" />
                <Text style={{ fontFamily: 'Poppins_400Regular', color: '#64748B', marginTop: 16 }}>No sub-organisations found.</Text>
              </View>
            ) : (
              orgs.map((org: any, index: number) => (
                <Animated.View key={org.id} entering={FadeInUp.delay(index * 50)}>
                  <SsfCard style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', padding: 16 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 16, color: '#0F172A' }}>{org.name}</Text>
                      <View style={{ flexDirection: 'row', gap: 12, marginTop: 6, alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                          <User size={12} color="#065F46" />
                          <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 12, color: '#065F46' }}>{org.admin_email}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                          <KeyRound size={12} color="#B45309" />
                          <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 12, color: '#B45309' }}>{org.admin_password_temp}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                        <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 10, color: '#065F46', textTransform: 'uppercase' }}>
                          {org.org_type || 'UNIT'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => router.push(`/unit-profile/${org.id}`)}
                        style={{ backgroundColor: '#EFF6FF', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE' }}
                      >
                        <ExternalLink size={16} color="#3B82F6" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDeleteOrg(org)}
                        style={{ backgroundColor: '#FEF2F2', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' }}
                      >
                        <Trash2 size={16} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  </SsfCard>
                </Animated.View>
              ))
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
