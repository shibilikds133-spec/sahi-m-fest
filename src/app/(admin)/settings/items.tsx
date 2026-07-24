import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Alert, TextInput, TouchableOpacity, Modal } from 'react-native';
import { SsfButton } from '../../../components/ui/SsfButton';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfInput } from '../../../components/ui/SsfInput';
import { useFestival } from '../../../core/hooks/useFestival';
import { HANDBOOK_ITEMS } from '../../../constants/items';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Search, CheckCircle, Circle, Plus } from 'lucide-react-native';

export default function ItemActivationSettings() {
  const router = useRouter();
  const { useActiveFestival, useActiveItems, useUpdateActiveItems } = useFestival();
  const { data: festival } = useActiveFestival();
  const { data: activeCodes, isLoading } = useActiveItems(festival?.id);
  const updateActiveItems = useUpdateActiveItems(festival?.id);

  const [search, setSearch] = useState('');
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  
  // Custom Items state
  const [customItems, setCustomItems] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [customForm, setCustomForm] = useState({ code: 'CUST-', name: '', cat: 'GN', type: 'individual' });

  useEffect(() => {
    if (activeCodes) {
      setSelectedCodes(activeCodes);
    }
  }, [activeCodes]);

  const groupedItems = useMemo(() => {
    const combined = [...HANDBOOK_ITEMS, ...customItems];
    const list = combined.filter(item => 
      item.item_name_ml.toLowerCase().includes(search.toLowerCase()) || 
      item.item_code.toLowerCase().includes(search.toLowerCase())
    );

    const grouped: Record<string, typeof list> = {};
    list.forEach(item => {
      const cat = item.category_codes[0] || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });
    return grouped;
  }, [search, customItems]);

  const toggleItem = (code: string) => {
    setSelectedCodes(prev => 
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handleAddCustom = () => {
    if (!customForm.name || !customForm.cat) {
      Alert.alert('Error', 'Please fill in Name and Category');
      return;
    }
    
    // Auto Generate Code: Example: GN-C458
    const autoCode = `${customForm.cat.toUpperCase()}-C${Math.floor(100 + Math.random() * 900)}`;

    const newItem = {
      id: `custom-${Date.now()}`,
      item_code: autoCode,
      item_name_ml: customForm.name,
      category_codes: [customForm.cat.toUpperCase()],
      participation_type: customForm.type,
      source: 'custom'
    };
    setCustomItems([...customItems, newItem]);
    setSelectedCodes([...selectedCodes, newItem.item_code]);
    setIsAddModalOpen(false);
    setCustomForm({ code: '', name: '', cat: 'GN', type: 'individual' });
  };

  const handleSave = async () => {
    try {
      // Find full records for all selected codes to ensure they exist in DB
      const selectedRecords = [...HANDBOOK_ITEMS, ...customItems].filter(i => 
        selectedCodes.includes(i.item_code)
      );

      await updateActiveItems.mutateAsync({ 
        selectedCodes, 
        itemRecords: selectedRecords 
      });
      
      Alert.alert('Success', `${selectedCodes.length} items activated!`);
      // Use replace instead of back() to avoid GO_BACK error when no history exists
      router.replace('/(admin)/settings' as any);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to sync items');
    }
  };

  if (isLoading) return <View className="flex-1 bg-ssf-bg"><Text>Loading...</Text></View>;

  return (
    <View className="flex-1 bg-ssf-bg">
      <LinearGradient 
        colors={['#065F46', '#044230']}
        className="pt-16 pb-8 px-6 rounded-b-[40px] shadow-sm mb-4"
      >
        <Text className="text-3xl font-poppins-black text-white">Item Activation</Text>
        <Text className="text-ssf-surface opacity-80 font-poppins mt-1">Enable items from the 170 Sahityotsav 2026 events</Text>
      </LinearGradient>

      <View className="px-5 mb-4 border-b border-slate-200 pb-2">
        <View className="bg-white rounded-2xl flex-row items-center px-4 py-3 shadow-sm border border-slate-100">
          <Search size={20} color="#64748B" />
          <TextInput 
            className="flex-1 ml-3 font-poppins text-ssf-text"
            placeholder="Search items or codes..."
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <ScrollView className="px-5">
        <Animated.View entering={FadeInUp.duration(600)}>
          <View className="flex-row justify-between items-center mb-4 px-2">
            <Text className="font-poppins-black text-ssf-text-muted">{selectedCodes.length} items selected</Text>
            <View className="flex-row items-center">
              <TouchableOpacity onPress={() => setIsAddModalOpen(true)} className="mr-4">
                <Text className="text-ssf-gold font-poppins-bold">+ Custom</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSelectedCodes(HANDBOOK_ITEMS.map(i => i.item_code))}>
                <Text className="text-ssf-primary font-poppins-bold">Select All</Text>
              </TouchableOpacity>
            </View>
          </View>

          {Object.entries(groupedItems).map(([category, items]) => (
            <View key={category} className="mb-4">
              <View className="bg-ssf-primary/10 py-1 px-3 rounded-md self-start mb-3 ml-1">
                <Text className="font-poppins-bold text-ssf-primary text-sm">{category} Category</Text>
              </View>
              
              {items.map((item) => {
                const isSelected = selectedCodes.includes(item.item_code);
                return (
                  <TouchableOpacity key={item.item_code} onPress={() => toggleItem(item.item_code)}>
                    <SsfCard className="mb-3 p-4 flex-row items-center border border-transparent" style={isSelected ? { borderColor: '#065F4633', backgroundColor: '#F0FDF4' } : {}}>
                      <View className="flex-1">
                        <Text className="text-xs font-poppins-bold text-ssf-primary mb-1">{item.item_code}</Text>
                        <Text className="text-base font-poppins-black text-ssf-text">{item.item_name_ml}</Text>
                        <Text className="text-xs text-ssf-text-muted mt-1">{item.participation_type === 'individual' ? 'Individual' : 'Group'} Match</Text>
                      </View>
                      {isSelected ? (
                        <CheckCircle size={24} color="#065F46" />
                      ) : (
                        <Circle size={24} color="#CBD5E1" />
                      )}
                    </SsfCard>
                  </TouchableOpacity>
                )
              })}
            </View>
          ))}
          <View className="h-28" />
        </Animated.View>
      </ScrollView>

      <View className="absolute bottom-8 left-5 right-5 pb-6 bg-ssf-bg">
        <SsfButton 
          label={`Save Changes (${selectedCodes.length} Items)`}
          onPress={handleSave}
          isLoading={updateActiveItems.isPending}
          className="shadow-2xl shadow-ssf-primary/40"
        />
      </View>

      {/* Add Custom Item Modal */}
      <Modal visible={isAddModalOpen} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white p-6 rounded-t-3xl min-h-[50%]">
            <Text className="text-xl font-poppins-black text-ssf-text mb-4">Add Custom Item</Text>
            
            <SsfInput 
              label="Item Name (Malayalam/English)" 
              value={customForm.name} 
              onChangeText={t => setCustomForm({...customForm, name: t})} 
              className="mb-4"
            />
            
            <SsfInput 
              className="mb-4"
              label="Category (e.g. GN, LP, UP)" 
              value={customForm.cat} 
              onChangeText={t => setCustomForm({...customForm, cat: t})} 
            />

            <View className="flex-row mb-6 mt-2">
              <TouchableOpacity onPress={() => setCustomForm({...customForm, type: 'individual'})} className={`flex-1 py-3 items-center rounded-l-lg border border-r-0 ${customForm.type === 'individual' ? 'bg-ssf-primary/10 border-ssf-primary' : 'border-slate-200 bg-slate-50'}`}>
                <Text className={customForm.type === 'individual' ? 'text-ssf-primary font-poppins-bold' : 'text-slate-500 font-poppins'}>Individual</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCustomForm({...customForm, type: 'group'})} className={`flex-1 py-3 items-center rounded-r-lg border ${customForm.type === 'group' ? 'bg-ssf-primary/10 border-ssf-primary' : 'border-slate-200 bg-slate-50'}`}>
                <Text className={customForm.type === 'group' ? 'text-ssf-primary font-poppins-bold' : 'text-slate-500 font-poppins'}>Group</Text>
              </TouchableOpacity>
            </View>

            <SsfButton label="Add to List" onPress={handleAddCustom} className="mb-3" />
            <SsfButton label="Cancel" variant="outline" onPress={() => setIsAddModalOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
