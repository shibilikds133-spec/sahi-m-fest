import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Archive, Plus, RotateCcw } from 'lucide-react-native';
import { SsfButton } from '../../../components/ui/SsfButton';
import { SsfCard } from '../../../components/ui/SsfCard';
import { useFestival } from '../../../core/hooks/useFestival';
import { useFestivalCategories } from '../../../core/hooks/useFestivalCategories';
import { generateCategoryCode } from '../../../services/festivalCategoryService';
import type { FestivalCategory } from '../../../types/festivalCategory';

export default function CollegeFestCategoriesScreen() {
  const router = useRouter();
  const { useActiveFestival, useUpdateFestival } = useFestival();
  const { data: festival, isLoading: festivalLoading } = useActiveFestival();
  const isCollegeFest = festival?.festival_template === 'college_fest';
  const { data = [], isLoading, error, create, update, setActive } = useFestivalCategories(
    isCollegeFest ? festival?.id : undefined,
  );
  const updateFestival = useUpdateFestival();
  const [editing, setEditing] = useState<FestivalCategory | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [codeTouched, setCodeTouched] = useState(false);
  const [desiredActive, setDesiredActive] = useState(true);
  const [generalCategoryEnabled, setGeneralCategoryEnabled] = useState(true);

  useEffect(() => {
    if (festival) setGeneralCategoryEnabled(festival.general_category_enabled !== false);
  }, [festival]);

  useEffect(() => {
    if (!editing && !codeTouched) setCode(generateCategoryCode(name));
  }, [name, editing, codeTouched]);

  const reset = () => {
    setEditing(null); setName(''); setCode(''); setSortOrder('0'); setCodeTouched(false); setDesiredActive(true);
  };
  const beginEdit = (category: FestivalCategory) => {
    setEditing(category); setName(category.name); setCode(category.code);
    setSortOrder(String(category.sort_order)); setCodeTouched(true); setDesiredActive(category.is_active);
  };
  const save = async () => {
    if (!festival) return;
    const parsed = Number(sortOrder);
    if (!Number.isInteger(parsed)) return Alert.alert('Validation', 'Sort order must be a whole number.');
    try {
      const input = { name, code, sort_order: parsed };
      const saved = editing
        ? await update.mutateAsync({ id: editing.id, input })
        : await create.mutateAsync({ tenantId: festival.tenant_id, input });
      if (saved.is_active !== desiredActive) {
        await setActive.mutateAsync({ id: saved.id, isActive: desiredActive });
      }
      Alert.alert('Success', editing ? 'Category updated.' : 'Category created.');
      reset();
    } catch (saveError) {
      Alert.alert('Unable to save', saveError instanceof Error ? saveError.message : 'Please try again.');
    }
  };

  if (festivalLoading) return <View className="flex-1 items-center justify-center"><ActivityIndicator /></View>;
  if (!festival) return <View className="flex-1 items-center justify-center p-6"><Text>No active festival.</Text></View>;

  return (
    <ScrollView className="flex-1 bg-ssf-bg" contentContainerStyle={{ padding: 20, paddingBottom: 80 }}>
      <TouchableOpacity onPress={() => router.back()} className="mb-4 flex-row items-center">
        <ArrowLeft size={18} color="#1B6B3A" /><Text className="ml-2 font-poppins-bold text-emerald-800">Back</Text>
      </TouchableOpacity>
      <Text className="font-poppins-bold text-2xl text-ssf-text">Categories</Text>
      <Text className="mb-5 mt-1 font-poppins text-sm text-ssf-text-muted">
        Control which categories are available for this festival. Existing registrations and results are not changed.
      </Text>

      <SsfCard className="mb-5 p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-4">
            <Text className="font-poppins-bold text-base">General Category</Text>
            <Text className="mt-1 font-poppins text-xs text-ssf-text-muted">
              Enabled by default for every tenant. The tenant admin can turn it off when this festival does not use General-category events.
            </Text>
            <Text className="mt-2 font-poppins text-xs text-ssf-text-muted">
              Current status: {generalCategoryEnabled ? 'Available' : 'Disabled for new use'}
            </Text>
          </View>
          <Switch
            value={generalCategoryEnabled}
            disabled={updateFestival.isPending}
            onValueChange={(nextValue) => {
              const message = nextValue
                ? 'General category will be available for this festival.'
                : 'This only disables General category for new use. Existing registrations, schedules, marks, and results will remain unchanged.';
              Alert.alert(
                nextValue ? 'Enable General category?' : 'Disable General category?',
                message,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: nextValue ? 'Enable' : 'Disable',
                    style: nextValue ? 'default' : 'destructive',
                    onPress: async () => {
                      try {
                        await updateFestival.mutateAsync({
                          id: festival.id,
                          general_category_enabled: nextValue,
                        });
                        setGeneralCategoryEnabled(nextValue);
                        Alert.alert('Saved', `General category ${nextValue ? 'enabled' : 'disabled'}.`);
                      } catch (statusError) {
                        Alert.alert('Unable to update', statusError instanceof Error ? statusError.message : 'Please try again.');
                      }
                    },
                  },
                ],
              );
            }}
          />
        </View>
      </SsfCard>

      {isCollegeFest && <SsfCard className="mb-5 p-4">
        <Text className="mb-3 font-poppins-bold text-base">{editing ? 'Edit Category' : 'Create Category'}</Text>
        <Text className="mb-1 font-poppins text-xs text-ssf-text-muted">Category Name</Text>
        <TextInput value={name} onChangeText={setName} className="mb-3 rounded-xl border border-ssf-border p-3 font-poppins" />
        <Text className="mb-1 font-poppins text-xs text-ssf-text-muted">Category Code</Text>
        <TextInput value={code} autoCapitalize="none" onChangeText={(value) => { setCode(value); setCodeTouched(true); }} className="mb-3 rounded-xl border border-ssf-border p-3 font-poppins" />
        <Text className="mb-1 font-poppins text-xs text-ssf-text-muted">Sort Order</Text>
        <TextInput value={sortOrder} keyboardType="number-pad" onChangeText={setSortOrder} className="mb-4 rounded-xl border border-ssf-border p-3 font-poppins" />
        <View className="mb-4 flex-row items-center justify-between rounded-xl border border-ssf-border p-3">
          <View><Text className="font-poppins-bold text-sm">Active</Text><Text className="font-poppins text-xs text-ssf-text-muted">Archived categories cannot be selected for new participants.</Text></View>
          <Switch value={desiredActive} onValueChange={setDesiredActive} />
        </View>
        <View className="flex-row gap-x-2">
          <SsfButton label={create.isPending || update.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Create Category'} onPress={save} disabled={create.isPending || update.isPending} className="flex-1" />
          {editing && <SsfButton label="Cancel" variant="outline" onPress={reset} />}
        </View>
      </SsfCard>}

      {isCollegeFest && (isLoading ? <ActivityIndicator /> : error ? (
        <Text className="text-red-700">Unable to load categories. Please refresh.</Text>
      ) : data.length === 0 ? (
        <View className="items-center rounded-xl border border-dashed border-ssf-border p-8">
          <Plus size={28} color="#64748B" /><Text className="mt-2 font-poppins">No College Fest categories have been created yet.</Text>
        </View>
      ) : data.map((category) => (
        <SsfCard key={category.id} className="mb-3 p-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="font-poppins-bold text-base">{category.name}</Text>
              <Text className="font-poppins text-xs text-ssf-text-muted">{category.code} · Order {category.sort_order} · {category.is_active ? 'Active' : 'Archived'}</Text>
            </View>
            <TouchableOpacity onPress={() => beginEdit(category)} className="px-3 py-2"><Text className="font-poppins-bold text-emerald-700">Edit</Text></TouchableOpacity>
            <TouchableOpacity
              disabled={setActive.isPending}
              onPress={async () => {
                try { await setActive.mutateAsync({ id: category.id, isActive: !category.is_active }); }
                catch (statusError) { Alert.alert('Unable to update', statusError instanceof Error ? statusError.message : 'Please try again.'); }
              }}
              className="p-2"
            >
              {category.is_active ? <Archive size={18} color="#B45309" /> : <RotateCcw size={18} color="#047857" />}
            </TouchableOpacity>
          </View>
        </SsfCard>
      ))) }
    </ScrollView>
  );
}
