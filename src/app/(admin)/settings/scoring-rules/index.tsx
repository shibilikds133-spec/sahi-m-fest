import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '../../../../core/hooks/useGoBack';
import { ArrowLeft, Plus, Edit, UploadCloud, X } from 'lucide-react-native';
import { SsfCard } from '../../../../components/ui/SsfCard';
import { SsfButton } from '../../../../components/ui/SsfButton';
import { useAuthStore } from '../../../../core/store/authStore';
import { scoringRuleRepository } from '../../../../lib/repositories/scoringRuleRepository';
import { getCriterionKey } from '../../../../core/utils/scoringRules';

export default function ScoringRulesList() {
  const router = useRouter();
  const goBack = useGoBack('/(admin)/settings');
  const { tenant_id } = useAuthStore();
  const tenantId = tenant_id;

  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      const { data, error } = await scoringRuleRepository.listRules(tenantId || undefined);
      if (error) throw error;
      setRules(data || []);
    } catch (e) {
      console.error('Error loading rules', e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    try {
      if (!jsonText.trim()) {
        Alert.alert('Error', 'Please paste valid JSON');
        return;
      }
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) {
        Alert.alert('Error', 'JSON must be an array of rules');
        return;
      }

      setUploading(true);
      
      // We will loop over parsed and upsert based on event_name
      for (const rule of parsed) {
        if (!rule?.event_name || typeof rule.event_name !== 'string') {
          throw new Error('Every rule must have an event_name.');
        }
        const entryMode = rule.entry_mode === 'total_only' ? 'total_only' : 'criteria';
        const importedCriteria = Array.isArray(rule.criteria) ? rule.criteria : [];
        const totalMarks = entryMode === 'total_only' ? 100 : (parseInt(rule.total_marks) || 100);

        if (entryMode === 'criteria') {
          const criteriaTotal = importedCriteria.reduce(
            (sum: number, criterion: any) => sum + (parseInt(criterion.marks) || 0),
            0,
          );
          const criterionKeys = importedCriteria.map((criterion: any) =>
            getCriterionKey(criterion.name || '')
          );
          if (
            importedCriteria.length === 0
            || importedCriteria.some((criterion: any) => !criterion.name?.trim() || (parseInt(criterion.marks) || 0) <= 0)
            || criterionKeys.some((key: string) => !key)
            || new Set(criterionKeys).size !== criterionKeys.length
            || criteriaTotal !== totalMarks
          ) {
            throw new Error(`Invalid criteria for ${rule.event_name}. Criteria must be complete and total ${totalMarks}.`);
          }
        }

        // Find if this rule already exists
        const existing = rules.find(r => 
          r.event_name.toLowerCase() === rule.event_name.toLowerCase() && 
          r.tenant_id === tenantId
        );

        let savedRuleId;

        const payload = {
          event_name: rule.event_name,
          event_name_ml: rule.event_name_ml || null,
          total_marks: totalMarks,
          time_limit: rule.time_limit || null,
          guidelines: rule.guidelines || null,
          entry_mode: entryMode,
          tenant_id: tenantId, // Custom for this tenant
          is_default: false
        };

        if (existing) {
          await scoringRuleRepository.updateRule(existing.id, payload);
          savedRuleId = existing.id;
        } else {
          const { data, error } = await scoringRuleRepository.createRule(payload);
          if (error) throw error;
          savedRuleId = data.id;
        }

        // Paper Total keeps saved criteria dormant. Criteria imports update rows
        // before removing extras so a failed write cannot erase the old setup.
        if (entryMode === 'criteria') {
          const oldCriteria = existing
            ? [...(existing.scoring_criteria || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
            : [];

          for (let i = 0; i < importedCriteria.length; i++) {
            const criterion = importedCriteria[i];
            const criterionPayload = {
              name: criterion.name.trim(),
              marks: parseInt(criterion.marks),
              sort_order: criterion.sort_order ?? i,
            };
            const result = oldCriteria[i]
              ? await scoringRuleRepository.updateCriterion(oldCriteria[i].id, criterionPayload)
              : await scoringRuleRepository.createCriterion({
                  rule_id: savedRuleId,
                  ...criterionPayload,
                });
            if (result.error) throw result.error;
          }

          for (const removedCriterion of oldCriteria.slice(importedCriteria.length)) {
            const { error } = await scoringRuleRepository.deleteCriterion(removedCriterion.id);
            if (error) throw error;
          }
        }
      }

      Alert.alert('Success', 'Rules uploaded successfully');
      setShowUploadModal(false);
      setJsonText('');
      setLoading(true);
      loadRules();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Invalid JSON format');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View className="flex-1 bg-ssf-bg">
      <View className="bg-ssf-primary pt-14 pb-5 px-5 rounded-b-[24px]">
        <View className="flex-row items-center mb-1">
          <TouchableOpacity onPress={goBack} className="mr-3 p-1.5 bg-white/10 rounded-full">
            <ArrowLeft size={20} color="#FFF" />
          </TouchableOpacity>
          <Text className="text-xl font-poppins-black text-white flex-1" numberOfLines={1}>
            Scoring Rules
          </Text>
        </View>
        <Text className="text-white/70 font-poppins text-xs ml-10">
          Manage event criteria and maximum marks
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color="#1B6B3A" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView className="flex-1 px-4 pt-4">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="font-poppins-bold text-ssf-text text-lg">Event Rules</Text>
            <View className="flex-row gap-x-2">
              <TouchableOpacity 
                onPress={() => setShowUploadModal(true)}
                className="flex-row items-center bg-ssf-primary/10 px-3 py-1.5 rounded-full"
              >
                <UploadCloud size={16} color="#1B6B3A" />
                <Text className="font-poppins-bold text-ssf-primary text-xs ml-1">Upload JSON</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => router.push('/(admin)/settings/scoring-rules/new' as any)}
                className="flex-row items-center bg-ssf-primary/10 px-3 py-1.5 rounded-full"
              >
                <Plus size={16} color="#1B6B3A" />
                <Text className="font-poppins-bold text-ssf-primary text-xs ml-1">Add Custom</Text>
              </TouchableOpacity>
            </View>
          </View>

          {rules.map((rule) => (
            <SsfCard key={rule.id} className="mb-4">
              <View className="flex-row justify-between items-center mb-2">
                <View className="flex-1 pr-2">
                  <Text className="font-poppins-bold text-ssf-text text-base">
                    {rule.event_name}
                  </Text>
                  {rule.event_name_ml && (
                    <Text className="font-poppins text-ssf-text-muted text-xs">
                      {rule.event_name_ml}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => router.push(`/(admin)/settings/scoring-rules/${rule.id}` as any)}
                  className="p-2 bg-gray-50 rounded-full"
                >
                  <Edit size={18} color="#1B6B3A" />
                </TouchableOpacity>
              </View>

              <View className="flex-row items-center gap-x-3 mt-1">
                <View className="flex-row items-center bg-gray-100 px-2 py-1 rounded-md">
                  <Text className="font-poppins-bold text-gray-700 text-xs">Total: {rule.total_marks}</Text>
                </View>
                {rule.time_limit && (
                  <View className="flex-row items-center bg-gray-100 px-2 py-1 rounded-md">
                    <Text className="font-poppins text-gray-600 text-xs">{rule.time_limit}</Text>
                  </View>
                )}
                {rule.is_default && (
                  <View className="flex-row items-center bg-blue-50 px-2 py-1 rounded-md">
                    <Text className="font-poppins-bold text-blue-600 text-xs">Default Rule</Text>
                  </View>
                )}
                {rule.tenant_id && (
                  <View className="flex-row items-center bg-orange-50 px-2 py-1 rounded-md">
                    <Text className="font-poppins-bold text-orange-600 text-xs">Custom</Text>
                  </View>
                )}
                <View className={`flex-row items-center px-2 py-1 rounded-md ${
                  rule.entry_mode === 'total_only' ? 'bg-blue-50' : 'bg-green-50'
                }`}>
                  <Text className={`font-poppins-bold text-xs ${
                    rule.entry_mode === 'total_only' ? 'text-blue-700' : 'text-green-700'
                  }`}>
                    {rule.entry_mode === 'total_only' ? 'Paper Total' : 'Paperless'}
                  </Text>
                </View>
              </View>
              
              {rule.entry_mode !== 'total_only' && (
              <View className="mt-3 bg-gray-50 p-2 rounded-lg">
                <Text className="font-poppins-bold text-xs text-gray-500 mb-1">
                  Criteria ({rule.scoring_criteria?.length || 0})
                </Text>
                <View className="flex-row flex-wrap gap-1">
                  {rule.scoring_criteria?.sort((a: any, b: any) => a.sort_order - b.sort_order).map((c: any) => (
                    <Text key={c.id} className="font-poppins text-xs text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-200">
                      {c.name}: {c.marks}
                    </Text>
                  ))}
                </View>
              </View>
              )}
            </SsfCard>
          ))}
          <View className="h-20" />
        </ScrollView>
      )}

      {/* Upload JSON Modal */}
      <Modal visible={showUploadModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-center px-4">
          <View className="bg-white rounded-3xl p-5 max-h-[80%]">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="font-poppins-bold text-lg text-ssf-text">Upload Rules JSON</Text>
              <TouchableOpacity onPress={() => setShowUploadModal(false)}>
                <X size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <Text className="font-poppins text-xs text-gray-500 mb-3">
              Paste a JSON array containing event_name, entry_mode, total_marks, time_limit, guidelines, and criteria.
            </Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-xl p-4 font-poppins text-xs h-64 text-ssf-text"
              multiline
              textAlignVertical="top"
              placeholder='[ { "event_name": "Speech", "criteria": [...] } ]'
              value={jsonText}
              onChangeText={setJsonText}
            />
            <View className="mt-4 flex-row gap-x-3">
              <TouchableOpacity 
                className="flex-1 bg-gray-100 py-3 rounded-xl items-center"
                onPress={() => setShowUploadModal(false)}
              >
                <Text className="font-poppins-bold text-gray-600">Cancel</Text>
              </TouchableOpacity>
              <View className="flex-1">
                <SsfButton 
                  label="Import" 
                  onPress={handleUpload} 
                  isLoading={uploading}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
