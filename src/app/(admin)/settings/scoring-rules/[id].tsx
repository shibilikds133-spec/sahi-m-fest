import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Trash2, Plus } from 'lucide-react-native';
import { SsfCard } from '../../../../components/ui/SsfCard';
import { SsfButton } from '../../../../components/ui/SsfButton';
import { useAuthStore } from '../../../../core/store/authStore';
import { scoringRuleRepository } from '../../../../lib/repositories/scoringRuleRepository';
import { getCriterionKey } from '../../../../core/utils/scoringRules';

export default function EditScoringRule() {
  const { id } = useLocalSearchParams();
  const ruleId = Array.isArray(id) ? id[0] : id;
  const isNew = ruleId === 'new';
  
  const router = useRouter();
  const { tenant_id } = useAuthStore();
  const tenantId = tenant_id;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  
  const [rule, setRule] = useState<any>({
    event_name: '',
    event_name_ml: '',
    total_marks: '100',
    time_limit: '',
    guidelines: '',
    is_default: false,
    tenant_id: tenantId,
    entry_mode: 'criteria',
  });
  
  const [criteria, setCriteria] = useState<any[]>([]);

  useEffect(() => {
    if (!isNew) {
      loadRule();
    }
  }, [isNew]);

  const loadRule = async () => {
    try {
      const { data, error } = await scoringRuleRepository.getRule(ruleId);
      if (error) throw error;
      if (data) {
        setRule({
          ...data,
          total_marks: data.total_marks?.toString() || '100',
          entry_mode: data.entry_mode === 'total_only' ? 'total_only' : 'criteria',
        });
        setCriteria(data.scoring_criteria?.sort((a: any, b: any) => a.sort_order - b.sort_order) || []);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!rule.event_name) {
      Alert.alert('Validation Error', 'Event Name is required.');
      return;
    }
    
    const isTotalOnly = rule.entry_mode === 'total_only';
    const marksTotal = criteria.reduce((sum, c) => sum + (parseInt(c.marks) || 0), 0);
    const expectedTotal = isTotalOnly ? 100 : (parseInt(rule.total_marks) || 100);
    
    if (!isTotalOnly && criteria.length === 0) {
      Alert.alert('Validation Error', 'Paperless Criteria mode requires at least one criterion.');
      return;
    }

    if (!isTotalOnly && criteria.some(c => !c.name?.trim() || (parseInt(c.marks) || 0) <= 0)) {
      Alert.alert('Validation Error', 'Every criterion needs a name and a maximum mark greater than zero.');
      return;
    }

    const criterionKeys = criteria.map(c => getCriterionKey(c.name || ''));
    if (!isTotalOnly && (
      criterionKeys.some(key => !key)
      || new Set(criterionKeys).size !== criterionKeys.length
    )) {
      Alert.alert('Validation Error', 'Criterion names must be unique and contain English letters or numbers.');
      return;
    }

    if (!isTotalOnly && marksTotal !== expectedTotal) {
      Alert.alert('Validation Error', `Total marks in criteria (${marksTotal}) must match event total marks (${expectedTotal}).`);
      return;
    }

    setSaving(true);
    try {
      let savedRuleId = ruleId;
      
      const payload = {
        event_name: rule.event_name,
        event_name_ml: rule.event_name_ml || null,
        total_marks: expectedTotal,
        time_limit: rule.time_limit || null,
        guidelines: rule.guidelines || null,
        entry_mode: isTotalOnly ? 'total_only' : 'criteria',
        tenant_id: rule.is_default && !tenantId ? null : tenantId, // Only keep null if superadmin editing default
      };

      if (isNew) {
        const { data, error } = await scoringRuleRepository.createRule({ ...payload, is_default: false });
        if (error) throw error;
        savedRuleId = data.id;
      } else {
        // If editing a global default rule as a tenant admin, we must clone it to their tenant
        if (rule.tenant_id === null && tenantId) {
          const { data, error } = await scoringRuleRepository.createRule({ ...payload, is_default: false });
          if (error) throw error;
          savedRuleId = data.id;
        } else {
          const { error } = await scoringRuleRepository.updateRule(ruleId, payload);
          if (error) throw error;
        }
      }

      // Total-only mode deliberately keeps any saved criteria dormant. This makes
      // switching back to paperless mode reversible and prevents accidental loss.
      if (!isTotalOnly) {
        const isEditingOriginal = !isNew && (rule.tenant_id !== null || !tenantId);
        const oldCriteriaIds = new Set<string>(
          isEditingOriginal
            ? (rule.scoring_criteria || []).map((c: any) => String(c.id))
            : [],
        );
        const retainedIds = new Set<string>();

        // Write the replacement configuration before deleting removed rows. A
        // failed insert/update therefore never leaves the rule without criteria.
        for (let i = 0; i < criteria.length; i++) {
          const c = criteria[i];
          if (isEditingOriginal && oldCriteriaIds.has(c.id)) {
            const { error } = await scoringRuleRepository.updateCriterion(c.id, {
              name: c.name.trim(),
              marks: parseInt(c.marks),
              sort_order: i,
            });
            if (error) throw error;
            retainedIds.add(c.id);
          } else {
            const { error } = await scoringRuleRepository.createCriterion({
              rule_id: savedRuleId,
              name: c.name.trim(),
              marks: parseInt(c.marks),
              sort_order: i,
            });
            if (error) throw error;
          }
        }

        for (const criterionId of oldCriteriaIds) {
          if (!retainedIds.has(criterionId)) {
            const { error } = await scoringRuleRepository.deleteCriterion(criterionId);
            if (error) throw error;
          }
        }
      }

      Alert.alert('Success', 'Scoring rule saved successfully.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const addCriteria = () => {
    setCriteria([...criteria, { id: `temp_${Date.now()}`, name: '', marks: '20' }]);
  };

  const updateCriteria = (index: number, field: string, value: string) => {
    const updated = [...criteria];
    updated[index] = { ...updated[index], [field]: value };
    setCriteria(updated);
  };

  const removeCriteria = (index: number) => {
    const updated = [...criteria];
    updated.splice(index, 1);
    setCriteria(updated);
  };

  if (loading) return <ActivityIndicator color="#1B6B3A" style={{ marginTop: 60 }} />;

  const isGlobalDefault = rule.tenant_id === null && !isNew;
  const isCloning = isGlobalDefault && tenantId; // If tenant admin edits global rule, it clones

  return (
    <View className="flex-1 bg-ssf-bg">
      <View className="bg-ssf-primary pt-14 pb-5 px-5 rounded-b-[24px]">
        <View className="flex-row items-center mb-1">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1.5 bg-white/10 rounded-full">
            <ArrowLeft size={20} color="#FFF" />
          </TouchableOpacity>
          <Text className="text-xl font-poppins-black text-white flex-1" numberOfLines={1}>
            {isNew ? 'New Rule' : isCloning ? 'Clone Rule' : 'Edit Rule'}
          </Text>
        </View>
        <Text className="text-white/70 font-poppins text-xs ml-10">
          {isCloning ? 'Editing a global rule creates a custom copy for your organization.' : 'Configure event criteria'}
        </Text>
      </View>

      <ScrollView className="flex-1 px-4 pt-4">
        <SsfCard className="mb-4">
          <Text className="font-poppins-bold text-ssf-text text-base mb-3">Event Details</Text>
          
          <View className="mb-3">
            <Text className="font-poppins text-sm text-ssf-text-muted mb-1">Event Name (English) *</Text>
            <TextInput
              value={rule.event_name}
              onChangeText={(t) => setRule({ ...rule, event_name: t })}
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-poppins text-ssf-text"
              placeholder="e.g. Speech"
            />
          </View>

          <View className="mb-3">
            <Text className="font-poppins text-sm text-ssf-text-muted mb-1">Event Name (Malayalam)</Text>
            <TextInput
              value={rule.event_name_ml || ''}
              onChangeText={(t) => setRule({ ...rule, event_name_ml: t })}
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-poppins text-ssf-text"
              placeholder="e.g. പ്രസംഗം"
            />
          </View>

          <View className="flex-row gap-x-3 mb-1">
            <View className="flex-1">
              <Text className="font-poppins text-sm text-ssf-text-muted mb-1">Total Marks *</Text>
              <TextInput
                value={rule.total_marks?.toString()}
                onChangeText={(t) => setRule({ ...rule, total_marks: t })}
                keyboardType="number-pad"
                editable={rule.entry_mode !== 'total_only'}
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-poppins text-ssf-text"
                placeholder="100"
              />
            </View>
            <View className="flex-1">
              <Text className="font-poppins text-sm text-ssf-text-muted mb-1">Time Limit</Text>
              <TextInput
                value={rule.time_limit || ''}
                onChangeText={(t) => setRule({ ...rule, time_limit: t })}
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-poppins text-ssf-text"
                placeholder="e.g. 5m"
              />
            </View>
          </View>

          <View className="mb-1">
            <Text className="font-poppins text-sm text-ssf-text-muted mb-1">Guidelines (കുറിപ്പുകൾ)</Text>
            <TextInput
              value={rule.guidelines || ''}
              onChangeText={(t) => setRule({ ...rule, guidelines: t })}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-poppins text-ssf-text min-h-[100px]"
              placeholder="Enter guidelines for judges here..."
            />
          </View>
        </SsfCard>

        <SsfCard className="mb-4">
          <Text className="font-poppins-bold text-ssf-text text-base mb-1">Mark Entry Mode</Text>
          <Text className="font-poppins text-xs text-ssf-text-muted mb-3">
            Choose how judges record marks for this event.
          </Text>
          <View className="flex-row gap-x-2">
            <TouchableOpacity
              onPress={() => setRule({ ...rule, entry_mode: 'criteria' })}
              className={`flex-1 rounded-xl border p-3 ${
                rule.entry_mode !== 'total_only'
                  ? 'bg-green-50 border-ssf-primary'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <Text className="font-poppins-bold text-sm text-ssf-text">Paperless Criteria</Text>
              <Text className="font-poppins text-[10px] text-ssf-text-muted mt-1">Enter every criterion in the app</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setRule({ ...rule, entry_mode: 'total_only', total_marks: '100' })}
              className={`flex-1 rounded-xl border p-3 ${
                rule.entry_mode === 'total_only'
                  ? 'bg-blue-50 border-blue-500'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <Text className="font-poppins-bold text-sm text-ssf-text">Paper Total</Text>
              <Text className="font-poppins text-[10px] text-ssf-text-muted mt-1">Enter one final total out of 100</Text>
            </TouchableOpacity>
          </View>
          {rule.entry_mode === 'total_only' && (
            <View className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 mt-3">
              <Text className="font-poppins text-xs text-blue-700">
                Saved criteria will be kept safely and restored if Paperless Criteria is enabled later.
              </Text>
            </View>
          )}
        </SsfCard>

        {rule.entry_mode !== 'total_only' && (
          <>
            <View className="flex-row justify-between items-center mb-3 mt-2 px-1">
              <Text className="font-poppins-bold text-ssf-text text-base">Evaluation Criteria</Text>
              <Text className="font-poppins-bold text-ssf-primary text-sm">
                Total: {criteria.reduce((sum, c) => sum + (parseInt(c.marks) || 0), 0)} / {rule.total_marks}
              </Text>
            </View>

            {criteria.map((c, index) => (
              <View key={c.id || index} className="flex-row items-center gap-x-2 mb-3">
                <TextInput
                  value={c.name}
                  onChangeText={(t) => updateCriteria(index, 'name', t)}
                  className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 font-poppins text-ssf-text"
                  placeholder="Criteria Name (e.g. Confidence)"
                />
                <TextInput
                  value={c.marks?.toString()}
                  onChangeText={(t) => updateCriteria(index, 'marks', t)}
                  keyboardType="number-pad"
                  className="w-20 bg-white border border-gray-200 rounded-xl px-4 py-3 font-poppins text-center text-ssf-text"
                  placeholder="Marks"
                />
                <TouchableOpacity onPress={() => removeCriteria(index)} className="p-3 bg-red-50 rounded-xl border border-red-100">
                  <Trash2 size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              onPress={addCriteria}
              className="flex-row items-center justify-center py-4 bg-gray-50 border border-dashed border-gray-300 rounded-xl mb-6"
            >
              <Plus size={20} color="#6B7280" />
              <Text className="font-poppins-bold text-gray-600 ml-2">Add Criterion</Text>
            </TouchableOpacity>
          </>
        )}

        <View className="h-24" />
      </ScrollView>

      <View className="absolute bottom-6 left-4 right-4">
        <SsfButton
          label="Save Scoring Rule"
          onPress={handleSave}
          isLoading={saving}
          className="shadow-xl"
        />
      </View>
    </View>
  );
}
