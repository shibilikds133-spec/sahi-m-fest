import { ui } from '@/constants/designSystem';
import { isGeneralCategoryCode } from '@/core/utils/participantCompetitionFilter';
import React, { useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, ScrollView, Alert, TextInput, TouchableOpacity, Modal, useWindowDimensions, Platform } from 'react-native';
import { useFestival } from '../../../core/hooks/useFestival';
import { useFestivalCategories } from '../../../core/hooks/useFestivalCategories';
import { useAuthStore } from '../../../core/store/authStore';
import { HANDBOOK_ITEMS } from '../../../constants/items';
import { useRouter } from 'expo-router';
import { Search, CheckCircle, Circle, Pencil, Trash2 } from 'lucide-react-native';
import { Card, CardContent } from '../../../components/ui/shadcn/card';
import { Button } from '../../../components/ui/shadcn/button';
import { Input } from '../../../components/ui/shadcn/input';
import { Label } from '../../../components/ui/shadcn/label';
import { createRequestId } from '../../../core/utils/requestId';

export default function ItemActivationSettings() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 1024;
  const { useActiveFestival, useActiveItems, useSelectableItems, useHiddenCompetitionItemCodes, useApplyItemChanges, useUpdateCompetitionItem, useDeleteInactiveCompetitionItem } = useFestival();
  const { tenant_id: currentTenantId } = useAuthStore();
  const { data: festival } = useActiveFestival();
  const isCollegeFest = festival?.festival_template === 'college_fest';
  const { data: collegeCategories = [], isLoading: categoriesLoading } = useFestivalCategories(
    isCollegeFest ? festival?.id : undefined,
    true,
  );
  const itemCategoryOptions = useMemo(() => {
    if (!isCollegeFest || festival?.general_category_enabled !== true) {
      return collegeCategories.filter(category => !isGeneralCategoryCode(category.code));
    }
    return collegeCategories;
  }, [collegeCategories, festival?.general_category_enabled, isCollegeFest]);
  const { data: activeCodes, isLoading } = useActiveItems(festival?.id);
  const { data: persistedItems = [], isLoading: persistedItemsLoading } = useSelectableItems(festival?.id);
  const { data: hiddenCodes = [], isLoading: hiddenCodesLoading, error: hiddenCodesError } = useHiddenCompetitionItemCodes(festival?.id);
  const applyItemChanges = useApplyItemChanges(festival?.id);
  const updateCompetitionItem = useUpdateCompetitionItem(festival?.id);
  const deleteInactiveItem = useDeleteInactiveCompetitionItem(festival?.id);

  const [search, setSearch] = useState('');
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [selectionBase, setSelectionBase] = useState<string[]>([]);
  const [draftFestivalId, setDraftFestivalId] = useState<string | null>(null);
  const [customItems, setCustomItems] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [itemEditError, setItemEditError] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState(false);
  const [deletingItem, setDeletingItem] = useState<any | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [customForm, setCustomForm] = useState({ code: 'CUST-', name: '', cat: 'GN', type: 'individual', groupSize: '' });
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const tenantFilterStorageKey = `items-show-tenant-only:${currentTenantId || 'unknown'}`;
  const [showTenantItemsOnly, setShowTenantItemsOnly] = useState(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.localStorage.getItem(`items-show-tenant-only:${currentTenantId || 'unknown'}`) === 'true';
    }
    return false;
  });
  const [tenantFilterLoaded, setTenantFilterLoaded] = useState(false);

  const formCategoryOptions = useMemo(() => {
    if (!editingItem) return itemCategoryOptions;
    const currentCodes = Array.isArray(editingItem.category_codes)
      ? editingItem.category_codes.map(String)
      : String(editingItem.category_codes || '').split(',').map((code: string) => code.trim()).filter(Boolean);
    const missingCurrentCodes = currentCodes
      .filter((code: string) => !itemCategoryOptions.some(category => category.code === code))
      .map((code: string) => ({ id: code, code, name: code }));
    return [...itemCategoryOptions, ...missingCurrentCodes];
  }, [editingItem, itemCategoryOptions]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setShowTenantItemsOnly(typeof window !== 'undefined' && window.localStorage.getItem(tenantFilterStorageKey) === 'true');
      setTenantFilterLoaded(true);
      return;
    }
    let cancelled = false;
    setTenantFilterLoaded(false);
    AsyncStorage.getItem(tenantFilterStorageKey).then(value => {
      if (!cancelled) {
        setShowTenantItemsOnly(value === 'true');
        setTenantFilterLoaded(true);
      }
    }).catch(() => {
      if (!cancelled) setTenantFilterLoaded(true);
    });
    return () => { cancelled = true; };
  }, [tenantFilterStorageKey]);

  useEffect(() => {
    if (tenantFilterLoaded) {
      AsyncStorage.setItem(tenantFilterStorageKey, String(showTenantItemsOnly)).catch(() => undefined);
    }
  }, [showTenantItemsOnly, tenantFilterLoaded, tenantFilterStorageKey]);

  useEffect(() => {
    if (isCollegeFest && formCategoryOptions.length > 0) {
      setCustomForm(current => ({ ...current, cat: current.cat && current.cat.split(',').every(code => formCategoryOptions.some(category => category.code === code))
        ? current.cat
        : formCategoryOptions[0].code }));
    } else if (!isCollegeFest) {
      setCustomForm(current => ({ ...current, cat: 'GN' }));
    }
  }, [isCollegeFest, formCategoryOptions]);

  useEffect(() => {
    if (festival?.id && activeCodes && draftFestivalId !== festival.id) {
      setSelectedCodes(activeCodes);
      setSelectionBase(activeCodes);
      setDraftFestivalId(festival.id);
      setCustomItems([]);
    }
  }, [activeCodes, festival?.id, draftFestivalId]);

  const availableItems = useMemo(() => {
    const hidden = new Set(hiddenCodes);
    const combined = [
      ...HANDBOOK_ITEMS.filter(item => !hidden.has(item.item_code)),
      ...(Array.isArray(persistedItems) ? persistedItems : []),
      ...customItems,
    ];
    const unique = new Map<string, any>();
    combined.forEach(item => {
      const existing = unique.get(item.item_code);
      const isCurrentTenantItem = item.tenant_id === currentTenantId || item.source === 'custom';
      if (!existing || isCurrentTenantItem) unique.set(item.item_code, item);
    });
    return Array.from(unique.values()).filter(item =>
      !hidden.has(item.item_code) && (!showTenantItemsOnly || item.tenant_id === currentTenantId || item.source === 'custom')
    );
  }, [currentTenantId, customItems, hiddenCodes, persistedItems, showTenantItemsOnly]);

  const groupedItems = useMemo(() => {
    const combined = availableItems;
    const list = combined.filter(item =>
      String(item.item_name_ml ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(item.item_code ?? '').toLowerCase().includes(search.toLowerCase())
    );

    const grouped: Record<string, typeof list> = {};
    list.forEach(item => {
      const cat = item.category_codes[0] || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });
    return grouped;
  }, [availableItems, search]);

  const allItems = useMemo(() => {
    return availableItems.filter(item =>
      String(item.item_name_ml ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(item.item_code ?? '').toLowerCase().includes(search.toLowerCase())
    );
  }, [availableItems, search]);

  const isDraftItem = (item: any) => customItems.some(candidate => candidate.id === item.id);
  const hasFixedGroupSize = (item: any) => {
    const minMembers = Number(item.group_min_members);
    const maxMembers = Number(item.group_max_members);
    return Number.isSafeInteger(minMembers) && minMembers > 0 && minMembers === maxMembers;
  };
  const canEditItem = (item: any) => {
    if (isDraftItem(item)) return true;
    if (!item.id || !currentTenantId || item.tenant_id !== currentTenantId) return false;
    if (item.participation_type === 'individual') return true;
    return item.participation_type === 'group' && hasFixedGroupSize(item);
  };

  const hasPendingSelectionChanges = customItems.length > 0 ||
    selectedCodes.length !== selectionBase.length || selectedCodes.some(code => !selectionBase.includes(code));
  const canDeleteItem = (item: any) => !isDraftItem(item) && !!item.id &&
    item.tenant_id === currentTenantId && item.festival_id === festival?.id &&
    item.is_active === false && !selectionBase.includes(item.item_code);
  const confirmDeleteItem = async () => {
    if (!deletingItem || !canDeleteItem(deletingItem) || hasPendingSelectionChanges) return;
    setDeleteError('');
    try {
      await deleteInactiveItem.mutateAsync(deletingItem.id);
      setDeletingItem(null);
    } catch (error: any) {
      setDeleteError(error?.message || 'Could not delete this competition.');
    }
  };

  const closeItemModal = () => {
    setIsAddModalOpen(false);
    setEditingItem(null);
    setEditingDraft(false);
    setItemEditError(null);
    setCategoryMenuOpen(false);
  };

  const openItemEditor = (item: any) => {
    const draft = isDraftItem(item);
    const categoryCodes = Array.isArray(item.category_codes)
      ? item.category_codes.map(String)
      : String(item.category_codes || '').split(',').map((code: string) => code.trim()).filter(Boolean);
    setEditingItem(item);
    setItemEditError(null);
    setEditingDraft(draft);
    setCustomForm({
      code: item.item_code || '',
      name: item.item_name_ml || item.item_name_en || '',
      cat: categoryCodes.join(','),
      type: item.participation_type || 'individual',
      groupSize: item.group_min_members == null ? '' : String(item.group_min_members),
    });
    setIsAddModalOpen(true);
  };

  const toggleItem = (code: string) => {
    setSelectedCodes(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handleSaveItemDetails = async () => {
    const name = customForm.name.trim();
    if (!name || !customForm.cat.trim()) {
      Alert.alert('Error', 'Please fill in Name and Category');
      return;
    }
    const categories = [...new Set(customForm.cat.split(',').map(value => value.trim()).filter(Boolean))];
    if (!categories.length || (isCollegeFest && categories.some(code => !formCategoryOptions.some(category => category.code === code)))) {
      Alert.alert('Error', 'Select valid categories.'); return;
    }
    if (editingItem && editingDraft && categories.length !== 1) {
      Alert.alert('Error', 'A new item draft must have exactly one category.'); return;
    }
    const groupSize = Number(customForm.groupSize);
    if (customForm.type === 'group' && (!/^\d+$/.test(customForm.groupSize.trim()) || !Number.isSafeInteger(groupSize) || groupSize < 1 || groupSize > 2147483647)) {
      Alert.alert('Error', 'Enter the number of members for this group competition.');
      return;
    }

    if (editingItem && !editingDraft) {
      setItemEditError(null);
      try {
        await updateCompetitionItem.mutateAsync({
          itemId: editingItem.id,
          itemNameMl: name,
          categoryCodes: categories,
          groupMemberCount: editingItem.participation_type === 'group' ? groupSize : null,
          expectedUpdatedAt: editingItem.updated_at ?? null,
        });
        Alert.alert('Success', 'Item details updated.');
        closeItemModal();
      } catch (e: any) {
        const message = e?.message || 'Failed to update item. Reload and try again.';
        setItemEditError(e?.code ? `[${e.code}] ${message}` : message);
      }
      return;
    }

    if (editingItem && editingDraft) {
      const oldCode = editingItem.item_code;
      const nextCode = `${categories[0].toUpperCase()}-C${String(editingItem.id).slice(0, 8).toUpperCase()}`;
      setCustomItems(current => current.map(item => item.id === editingItem.id ? {
        ...item,
        item_code: nextCode,
        item_name_ml: name,
        category_codes: categories,
        participation_type: customForm.type,
        group_min_members: customForm.type === 'group' ? groupSize : undefined,
        group_max_members: customForm.type === 'group' ? groupSize : undefined,
      } : item));
      setSelectedCodes(current => current.map(code => code === oldCode ? nextCode : code));
      closeItemModal();
      return;
    }

    const newItems = categories.map(category => {
      const id = createRequestId();
      return { id, item_code: `${category.toUpperCase()}-C${id.slice(0, 8).toUpperCase()}`,
        item_name_ml: name, category_codes: [category], participation_type: customForm.type, source: 'custom',
        ...(customForm.type === 'group' ? { group_min_members: groupSize, group_max_members: groupSize } : {}) };
    });
    setCustomItems(current => [...current, ...newItems]);
    setSelectedCodes(current => [...current, ...newItems.map(item => item.item_code)]);
    closeItemModal();
    setCustomForm({ code: '', name: '', cat: isCollegeFest ? (itemCategoryOptions[0]?.code || '') : 'GN', type: 'individual', groupSize: '' });
  };

  const handleSave = async () => {
    try {
      const selectedSet = new Set(selectedCodes);
      const originalSet = new Set(selectionBase);
      const activateCodes = selectedCodes.filter(code => !originalSet.has(code));
      const deactivateCodes = selectionBase.filter(code => !selectedSet.has(code));
      const selectedRecords = [...HANDBOOK_ITEMS, ...customItems].filter(i =>
        activateCodes.includes(i.item_code)
      );
      await applyItemChanges.mutateAsync({
        activateCodes,
        deactivateCodes,
        itemRecords: selectedRecords
      });
      Alert.alert('Success', 'Item changes saved.');
      router.replace('/(admin)/settings' as any);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to sync items');
    }
  };

  if (isLoading || persistedItemsLoading || hiddenCodesLoading) {
    return (
      <View className="flex-1 bg-ssf-bg items-center justify-center">
        <Text className="font-poppins text-ui-text-muted">Loading...</Text>
      </View>
    );
  }

  if (hiddenCodesError) {
    return <View className="flex-1 items-center justify-center bg-ssf-bg px-4"><Text className="font-poppins text-sm text-red-700">Could not load festival item visibility. Please retry.</Text></View>;
  }

  return (
    <View className="flex-1 bg-ssf-bg">
      <ScrollView className="flex-1 py-6 px-4" contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Page Title — matches schedule page pattern */}
        <View className="mb-6">
          <Text className="text-3xl font-poppins-black text-ui-text">Item Activation</Text>
          <Text className="text-sm font-poppins text-ui-text-muted mt-1">
            Enable items from the {HANDBOOK_ITEMS.length} Sahityotsav 2026 events
          </Text>
        </View>

        {/* Search + Actions Bar */}
        <View className="flex-row items-center gap-3 mb-4">
          <View className="flex-1 flex-row items-center bg-white border border-ui-border rounded-lg px-3 h-10">
            <Search size={16} color={ui.colors.textSubtle} />
            <TextInput
              className="flex-1 ml-2 font-poppins text-sm text-ui-text"
              placeholder="Search items or codes..."
              placeholderTextColor={ui.colors.textSubtle}
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <Button variant="outline" size="sm" disabled={isCollegeFest && (categoriesLoading || itemCategoryOptions.length === 0)} onPress={() => {
            setEditingItem(null);
            setEditingDraft(false);
            setCustomForm({ code: 'CUST-', name: '', cat: isCollegeFest ? (itemCategoryOptions[0]?.code || '') : 'GN', type: 'individual', groupSize: '' });
            setIsAddModalOpen(true);
          }}>
            + Custom
          </Button>
          <Button variant="ghost" size="sm" onPress={() => setSelectedCodes(availableItems.map(i => i.item_code))}>
            Select All
          </Button>
        </View>

        <TouchableOpacity
          className="mb-4 flex-row items-center gap-2 self-start rounded-lg border border-ui-border bg-white px-3 py-2"
          onPress={() => setShowTenantItemsOnly(current => !current)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: showTenantItemsOnly }}
        >
          {showTenantItemsOnly ? <CheckCircle size={17} color="#0F766E" /> : <Circle size={17} color={ui.colors.textSubtle} />}
          <Text className="font-poppins text-xs text-ui-text">
            Show this tenant&apos;s competitions only
          </Text>
        </TouchableOpacity>

        {/* Stats */}
        <Text className="text-sm font-poppins-bold text-ui-text-muted mb-4 px-1">
          {selectedCodes.length} items selected
        </Text>

        {/* Desktop: Table View */}
        {isDesktop ? (
          <Card className="mb-6">
            <CardContent className="p-0">
              {/* Table Header */}
              <View className="flex-row bg-ui-muted px-4 py-3 border-b border-ui-border">
                <View className="w-10" />
                <View className="flex-1">
                  <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Code</Text>
                </View>
                <View className="flex-[2]">
                  <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Name</Text>
                </View>
                <View className="w-24">
                  <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Category</Text>
                </View>
                <View className="w-24">
                  <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Type</Text>
                </View>
                <View className="w-36">
                  <Text className="font-poppins-bold text-[10px] uppercase tracking-wider text-ui-text-muted">Action</Text>
                </View>
              </View>

              {/* Table Rows */}
              {allItems.map((item, idx) => {
                const isSelected = selectedCodes.includes(item.item_code);
                const editable = canEditItem(item);
                const tenantOwned = isDraftItem(item) || (!!currentTenantId && item.tenant_id === currentTenantId);
                const unsupportedGroupSize = item.participation_type === 'group' && !hasFixedGroupSize(item);
                return (
                  <View key={item.item_code} className={`flex-row items-center border-b border-ui-border px-4 py-2 ${isSelected ? 'bg-green-50' : idx % 2 === 0 ? 'bg-white' : 'bg-ui-muted/30'}`}>
                    <TouchableOpacity onPress={() => toggleItem(item.item_code)} className="min-h-11 flex-1 flex-row items-center">
                      <View className="w-10">
                        {isSelected ? <CheckCircle size={18} color="#0F766E" /> : <Circle size={18} color="#CBD5E1" />}
                      </View>
                      <View className="flex-1">
                        <Text className="font-poppins-bold text-xs text-ui-primary">{item.item_code}</Text>
                      </View>
                      <View className="flex-[2]">
                        <Text className="font-poppins text-sm text-ui-text">{item.item_name_ml}</Text>
                      </View>
                      <View className="w-24">
                        <View className="bg-ui-primary/10 px-2 py-0.5 rounded self-start">
                          <Text className="font-poppins-bold text-[10px] text-ui-primary">{item.category_codes?.[0] || 'GN'}</Text>
                        </View>
                      </View>
                      <View className="w-24">
                        <Text className="font-poppins text-xs text-ui-text-muted">{item.participation_type === 'individual' ? 'Individual' : 'Group'}</Text>
                      </View>
                    </TouchableOpacity>
                    <View className="ml-2 w-36 flex-row items-center justify-end gap-2">
                      {editable ? <TouchableOpacity onPress={() => openItemEditor(item)} className="h-10 min-w-16 flex-row items-center justify-center gap-1 rounded-md border border-ui-border bg-white px-2" accessibilityRole="button" accessibilityLabel={`Edit ${item.item_name_ml || item.item_code}`}>
                        <Pencil size={13} color={ui.colors.textSubtle} /><Text className="font-poppins-bold text-[10px] text-ui-text">Edit</Text>
                      </TouchableOpacity> : tenantOwned && unsupportedGroupSize ? <Text className="max-w-16 text-center font-poppins text-[9px] text-ui-text-muted">Set fixed size first</Text> : null}
                      {canDeleteItem(item) && <TouchableOpacity onPress={() => { setDeleteError(''); setDeletingItem(item); }} className="h-10 w-10 items-center justify-center rounded-md border border-red-200 bg-white" accessibilityRole="button" accessibilityLabel={`Delete ${item.item_name_ml || item.item_code}`}>
                        <Trash2 size={15} color="#B91C1C" />
                      </TouchableOpacity>}
                    </View>
                  </View>
                );
              })}

              {allItems.length === 0 && (
                <View className="py-12 items-center">
                  <Text className="font-poppins text-ui-text-muted">No items found</Text>
                </View>
              )}
            </CardContent>
          </Card>
        ) : (
          /* Mobile: Card View */
          <View>
            {Object.entries(groupedItems).map(([category, items]) => (
              <View key={category} className="mb-4">
                <View className="bg-ui-primary/10 py-1 px-3 rounded self-start mb-3">
                  <Text className="font-poppins-bold text-ui-primary text-sm">{category} Category</Text>
                </View>

                {items.map((item) => {
                  const isSelected = selectedCodes.includes(item.item_code);
                  const editable = canEditItem(item);
                  const tenantOwned = isDraftItem(item) || (!!currentTenantId && item.tenant_id === currentTenantId);
                  const unsupportedGroupSize = item.participation_type === 'group' && !hasFixedGroupSize(item);
                  return (
                    <Card key={item.item_code} className={`mb-2 ${isSelected ? 'border-ui-primary/30 bg-green-50' : ''}`}>
                        <CardContent className="p-3 flex-row items-center">
                          <TouchableOpacity onPress={() => toggleItem(item.item_code)} className="min-h-11 flex-1 flex-row items-center">
                            <View className="flex-1">
                            <Text className="text-xs font-poppins-bold text-ui-primary mb-1">{item.item_code}</Text>
                            <Text className="text-base font-poppins-bold text-ui-text">{item.item_name_ml}</Text>
                            <Text className="text-xs text-ui-text-muted mt-1">
                              {item.participation_type === 'individual' ? 'Individual' : 'Group'} Match
                            </Text>
                            </View>
                            {isSelected ? <CheckCircle size={22} color="#0F766E" /> : <Circle size={22} color="#CBD5E1" />}
                          </TouchableOpacity>
                           <View className="ml-2 flex-row items-center gap-2">
                             {editable ? <TouchableOpacity onPress={() => openItemEditor(item)} className="h-11 min-w-11 flex-row items-center justify-center gap-1 rounded-md border border-ui-border bg-white px-2" accessibilityRole="button" accessibilityLabel={`Edit ${item.item_name_ml || item.item_code}`}>
                               <Pencil size={14} color={ui.colors.textSubtle} /><Text className="font-poppins-bold text-xs text-ui-text">Edit</Text>
                             </TouchableOpacity> : tenantOwned && unsupportedGroupSize ? <Text className="max-w-16 text-center font-poppins text-[9px] text-ui-text-muted">Set fixed size first</Text> : null}
                             {canDeleteItem(item) && <TouchableOpacity onPress={() => { setDeleteError(''); setDeletingItem(item); }} className="h-11 w-11 items-center justify-center rounded-md border border-red-200 bg-white" accessibilityRole="button" accessibilityLabel={`Delete ${item.item_name_ml || item.item_code}`}>
                               <Trash2 size={16} color="#B91C1C" />
                             </TouchableOpacity>}
                           </View>
                        </CardContent>
                    </Card>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Fixed Save Button */}
      <View className="absolute bottom-0 left-0 right-0 bg-ssf-bg border-t border-ui-border px-4 py-4">
        <Button onPress={handleSave} disabled={applyItemChanges.isPending || !draftFestivalId}>
          {applyItemChanges.isPending ? 'Saving...' : `Save Changes (${selectedCodes.length} Items)`}
        </Button>
      </View>

      {/* Add Custom Item Modal */}
      <Modal visible={isAddModalOpen} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white p-6 rounded-t-3xl min-h-[50%]">
            <Text className="text-xl font-poppins-bold text-ui-text mb-4">{editingItem ? 'Edit Item' : 'Add Custom Item'}</Text>

            <View className="mb-4">
              <Label>{editingItem ? 'Item Name (Malayalam)' : 'Item Name (Malayalam/English)'}</Label>
              <Input
                value={customForm.name}
                onChangeText={t => setCustomForm({...customForm, name: t})}
                placeholder="Enter item name"
              />
            </View>

            <View className="mb-4">
              <Label>{isCollegeFest ? 'Category' : 'Category (e.g. GN, LP, UP)'}</Label>
              {isCollegeFest ? (
                <View>
                  <TouchableOpacity
                    className="h-10 justify-center rounded-md border border-ui-border bg-white px-3"
                    onPress={() => setCategoryMenuOpen(current => !current)}
                    accessibilityRole="button"
                    accessibilityLabel="Select item category"
                  >
                    <Text className="font-poppins text-sm text-ui-text">
                      {customForm.cat || 'Select categories'}
                    </Text>
                  </TouchableOpacity>
                  {categoryMenuOpen && (
                    <View className="mt-1 rounded-md border border-ui-border bg-white">
                      {formCategoryOptions.map(category => (
                        <TouchableOpacity
                          key={category.id}
                          className="border-b border-ui-border px-3 py-2.5 last:border-b-0"
                          onPress={() => {
                            setCustomForm(current => {
                              const selected = current.cat.split(',').filter(Boolean);
                              return { ...current, cat: (selected.includes(category.code) ? selected.filter(code => code !== category.code) : [...selected, category.code]).join(',') };
                            });
                          }}
                        >
                          <Text className="font-poppins text-sm text-ui-text">{customForm.cat.split(',').includes(category.code) ? '✓ ' : ''}{category.name} ({category.code})</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              ) : (
                <Input
                  value={customForm.cat}
                  onChangeText={t => setCustomForm({...customForm, cat: t})}
                  placeholder="Category codes, separated by commas"
                />
              )}
            </View>

            <View className="mb-6">
              <Label>Participation Type</Label>
              {editingItem && !editingDraft ? (
                <Text className="mt-2 font-poppins text-sm text-ui-text">
                  {customForm.type === 'individual' ? 'Individual' : 'Group'} (fixed for this item)
                </Text>
              ) : <View className="flex-row gap-2 mt-2">
                <Button
                  variant={customForm.type === 'individual' ? 'default' : 'outline'}
                  size="sm"
                  onPress={() => setCustomForm({...customForm, type: 'individual'})}
                >
                  Individual
                </Button>
                <Button
                  variant={customForm.type === 'group' ? 'default' : 'outline'}
                  size="sm"
                  onPress={() => setCustomForm({...customForm, type: 'group'})}
                >
                  Group
                </Button>
              </View>}
            </View>

            {customForm.type === 'group' && <View className="mb-6">
              <Label>Members per group *</Label>
              <Input keyboardType="numeric" value={customForm.groupSize}
                onChangeText={groupSize => setCustomForm(current => ({ ...current, groupSize }))}
                placeholder="Enter the number of members" />
            </View>}

            {itemEditError && (
              <View
                className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2"
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
              >
                <Text className="font-poppins text-sm text-red-700">Save failed: {itemEditError}</Text>
              </View>
            )}

            <View className="gap-3">
              <Button onPress={handleSaveItemDetails} disabled={updateCompetitionItem.isPending}>{editingItem ? 'Save item details' : 'Add to List'}</Button>
              <Button variant="outline" onPress={closeItemModal}>Cancel</Button>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={!!deletingItem} transparent animationType="fade" onRequestClose={() => !deleteInactiveItem.isPending && setDeletingItem(null)}>
        <View className="flex-1 items-center justify-center bg-black/50 px-4">
          <View className="w-full max-w-md rounded-xl bg-white p-5" style={{ maxWidth: 420 }}>
            <Text className="font-poppins-bold text-lg text-ui-text">Delete competition?</Text>
            <Text className="mt-2 font-poppins text-sm text-ui-text-muted">
              {deletingItem?.item_name_ml || deletingItem?.item_code} ({deletingItem?.item_code}) will be removed from this festival. This is allowed only after deselecting and saving, and only when no competition history exists.
            </Text>
            {hasPendingSelectionChanges && <Text className="mt-3 font-poppins text-sm text-amber-700">Save or discard your other pending selection changes first.</Text>}
            {!!deleteError && <Text className="mt-3 font-poppins text-sm text-red-700" accessibilityRole="alert">{deleteError}</Text>}
            <View className="mt-5 flex-row justify-end gap-2">
              <TouchableOpacity onPress={() => setDeletingItem(null)} disabled={deleteInactiveItem.isPending} className="min-h-11 justify-center rounded-lg border border-ui-border px-4" accessibilityRole="button">
                <Text className="font-poppins-bold text-sm text-ui-text">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDeleteItem} disabled={deleteInactiveItem.isPending || hasPendingSelectionChanges} className={`min-h-11 justify-center rounded-lg px-4 ${deleteInactiveItem.isPending || hasPendingSelectionChanges ? 'bg-red-200' : 'bg-red-700'}`} accessibilityRole="button" accessibilityLabel="Confirm delete competition">
                <Text className="font-poppins-bold text-sm text-white">{deleteInactiveItem.isPending ? 'Deleting…' : 'Delete item'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
