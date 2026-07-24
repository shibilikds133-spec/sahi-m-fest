import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useGoBack } from '../../../core/hooks/useGoBack';
import { SsfCard } from '../../../components/ui/SsfCard';
import { SsfButton } from '../../../components/ui/SsfButton';
import { ArrowLeft, CheckCircle, AlertCircle, Play, Database, FileText, Upload, Calendar } from 'lucide-react-native';
import { useAuthStore } from '../../../core/store/authStore';
import { databaseProvider as db } from '../../../providers/database';
import { supabase } from '../../../core/config/supabase';
import { useFestival } from '../../../core/hooks/useFestival';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export default function ImportScheduleJson() {
  const router = useRouter();
  const goBack = useGoBack('/(admin)/schedule');
  
  const { tenant_id: authTenantId } = useAuthStore();
  const tenantId = authTenantId || '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
  
  const { useActiveFestival } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const festivalId = activeFestival?.id;

  const [rawText, setRawText] = useState<string>('');
  const [scheduleData, setScheduleData] = useState<any[]>([]);
  const [internalValidation, setInternalValidation] = useState<{ isValid: boolean; errors: string[] } | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importReport, setImportReport] = useState<any>(null);
  const [dryRunReport, setDryRunReport] = useState<any>(null);
  const [isDryRunning, setIsDryRunning] = useState(false);

  const handleFileUpload = (event: any) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRawText(text);
      processFileContent(text);
    };
    reader.readAsText(file);
  };

  const processFileContent = (text: string) => {
    try {
      let parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        if (parsed.schedules && Array.isArray(parsed.schedules)) {
          parsed = parsed.schedules;
        } else {
          throw new Error("JSON must be a list of schedule slots.");
        }
      }

      setScheduleData(parsed);
      
      // Perform internal validation for obvious duplicate fields
      const errors: string[] = [];
      const keys = new Set<string>();
      
      parsed.forEach((s: any, idx: number) => {
        if (!s.item_code) errors.push(`Row ${idx + 1}: Missing item_code`);
        if (!s.venue) errors.push(`Row ${idx + 1}: Missing venue name`);
        if (!s.date) errors.push(`Row ${idx + 1}: Missing date`);
        if (!s.start_time || !s.end_time) errors.push(`Row ${idx + 1}: Missing start/end time`);
        
        const key = `${s.venue}_${s.item_code}_${s.date}_${s.start_time}_${s.end_time}`;
        if (keys.has(key)) {
          errors.push(`Row ${idx + 1}: Duplicate slot details already exist in this file.`);
        } else {
          keys.add(key);
        }
      });

      setInternalValidation({
        isValid: errors.length === 0,
        errors
      });
      setDryRunReport(null);
      setImportReport(null);
    } catch (e: any) {
      Alert.alert("Parser Error", e.message);
      setInternalValidation({ isValid: false, errors: [e.message] });
    }
  };

  const runDryRunValidation = async () => {
    console.log("runDryRunValidation triggered");
    console.log("festivalId:", festivalId);
    console.log("scheduleData length:", scheduleData.length);
    console.log("isDryRunning:", isDryRunning);

    if (!festivalId) {
      alert("Error: No active festival found. Please activate a festival first.");
      console.log("Returned because festivalId is missing");
      return;
    }
    if (scheduleData.length === 0 || isDryRunning) {
      console.log("Returned because scheduleData is empty or isDryRunning is true");
      return;
    }
    console.log("Starting dry run...");
    setIsDryRunning(true);
    setDryRunReport(null);

    try {
      const errors: string[] = [];
      const conflicts: any[] = [];
      
      console.log("Fetching from db...");
      // 1. Fetch all venues and items for festival to map and validate locally
      
      console.log("Fetching venues...");
      const venuesRes = await supabase.from('venues').select('id, name').eq('festival_id', festivalId);
      if (venuesRes.error) console.error("Venues fetch error:", venuesRes.error);
      
      console.log("Fetching items...");
      const itemsRes = await supabase.from('items').select('id, item_code, item_name_en, category_codes').eq('festival_id', festivalId).eq('is_active', true);
      if (itemsRes.error) console.error("Items fetch error:", itemsRes.error);
      
      console.log("Fetching schedules...");
      const existingSchRes = await supabase.from('schedules').select('id, venue_id, start_time, end_time, items(item_name_en, item_code)').eq('festival_id', festivalId);
      if (existingSchRes.error) console.error("Schedules fetch error:", existingSchRes.error);
      
      console.log("DB Fetch complete.");

      const venues = venuesRes.data || [];
      const items = itemsRes.data || [];
      const existingSch = existingSchRes.data || [];
      
      console.log("venues:", venues.length, "items:", items.length, "existing:", existingSch.length);

      // 2. Validate row by row
      scheduleData.forEach((s, idx) => {
        const item = items.find(i => i.item_code === s.item_code);
        if (!item) {
          errors.push(`Row ${idx + 1}: Item code [${s.item_code}] not found in festival.`);
          return;
        }

        if (item.item_name_en.toLowerCase().trim() !== s.item_name.toLowerCase().trim()) {
          errors.push(`Row ${idx + 1}: Item name mismatch for [${s.item_code}]. Expected: "${item.item_name_en}" but got: "${s.item_name}"`);
        }

        const catCodes = Array.isArray(item.category_codes) ? item.category_codes : [item.category_codes];
        const isValidCategory = catCodes.some(c => c === s.category || c === 'GENERAL' || s.category === 'GENERAL' || c === 'GN');
        if (!isValidCategory) {
          errors.push(`Row ${idx + 1}: Category "${s.category}" mismatch for item [${s.item_code}] (Supports: ${catCodes.join(', ')})`);
        }

        const venue = venues.find(v => v.name.toLowerCase().trim() === s.venue.toLowerCase().trim());
        if (!venue) {
          errors.push(`Row ${idx + 1}: Venue "${s.venue}" does not exist. Create venue "${s.venue}" first.`);
          return;
        }

        // Overlap validation
        const newStart = new Date(`${s.date} ${s.start_time}`).getTime();
        const newEnd = new Date(`${s.date} ${s.end_time}`).getTime();

        if (isNaN(newStart) || isNaN(newEnd)) {
          errors.push(`Row ${idx + 1}: Invalid date or time format.`);
          return;
        }

        // Check against existing schedules
        existingSch.forEach((dbSch: any) => {
          if (dbSch.venue_id === venue.id) {
            const dbStart = new Date(dbSch.start_time).getTime();
            const dbEnd = new Date(dbSch.end_time).getTime();

            if (dbStart < newEnd && dbEnd > newStart && dbSch.items?.item_code !== s.item_code) {
              conflicts.push({
                row: idx + 1,
                item_code: s.item_code,
                item_name: s.item_name,
                venue: s.venue,
                conflict_with: dbSch.items?.item_name_en || 'Another Event',
                start_time: s.start_time,
                end_time: s.end_time,
                error: `Overlap with scheduled item: ${dbSch.items?.item_name_en}`
              });
            }
          }
        });
      });

      console.log("Validation done. Errors:", errors.length, "Conflicts:", conflicts.length);

      setDryRunReport({
        isValid: errors.length === 0 && conflicts.length === 0,
        errors,
        conflicts
      });

    } catch (e: any) {
      console.error("Dry run caught error:", e);
      alert("Dry-Run Error: " + e.message);
    } finally {
      console.log("Setting isDryRunning to false");
      setIsDryRunning(false);
    }
  };

  const executeImport = async () => {
    if (scheduleData.length === 0 || isProcessing) return;
    setIsProcessing(true);
    setProgress(0);
    setImportReport(null);

    const startTime = Date.now();

    try {
      const chunkSize = 50;
      const chunks = [];
      for (let i = 0; i < scheduleData.length; i += chunkSize) {
        const rawChunk = scheduleData.slice(i, i + chunkSize);
        // WORKAROUND: There is a typo in the DB migration '060_execute_schedule_import.sql'
        // The format string is 'YYYY-MM-DD HH:12:MI AM' instead of 'YYYY-MM-DD HH12:MI AM'
        // By injecting ':12:' into the time string (e.g. 07:30 PM -> 07:12:30 PM), it successfully parses the HH and MI.
        const fixedChunk = rawChunk.map(s => ({
          ...s,
          start_time: s.start_time.replace(/(\d{2}):(\d{2})\s?(AM|PM)/i, '$1:12:$2 $3'),
          end_time: s.end_time.replace(/(\d{2}):(\d{2})\s?(AM|PM)/i, '$1:12:$2 $3')
        }));
        chunks.push(fixedChunk);
      }

      let totalImported = 0;
      let totalSkipped = 0;
      let totalConflicts = 0;
      let totalInvalid = 0;
      let allErrors: any[] = [];
      let allConflicts: any[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        const { data: result, error: chunkErr } = await db.executeScheduleImportChunk({
          tenant_id: tenantId,
          festival_id: festivalId,
          schedules: chunk
        });

        if (chunkErr) {
          allErrors.push(`Chunk ${i} Failed: ${chunkErr.message}`);
          continue;
        }

        if (result) {
          totalImported += result.imported_count || 0;
          totalSkipped += result.skipped_count || 0;
          totalConflicts += result.conflict_count || 0;
          totalInvalid += result.invalid_count || 0;
          
          if (result.errors) allErrors = allErrors.concat(result.errors);
          if (result.conflicts) allConflicts = allConflicts.concat(result.conflicts);
        }

        setProgress(Math.round(((i + 1) / chunks.length) * 100));
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      const finalReport = {
        imported_count: totalImported,
        skipped_count: totalSkipped,
        conflict_count: totalConflicts,
        invalid_count: totalInvalid,
        errors: allErrors,
        conflicts: allConflicts,
        execution_time: `${duration}s`
      };

      setImportReport(finalReport);
      Alert.alert('Import Finished', `Successfully scheduled ${totalImported} items, skipped ${totalSkipped} duplicates.`);

    } catch (e: any) {
      Alert.alert('Critical Error', e.message);
    } finally {
      setIsProcessing(false);
      setProgress(100);
    }
  };

  const downloadConflictReport = async () => {
    const report = dryRunReport || importReport;
    if (!report) return;
    try {
      const jsonStr = JSON.stringify(report, null, 2);
      const filename = `Schedule_Conflict_Report_${Date.now()}.json`;

      if (Platform.OS === 'web') {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const uri = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = uri;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const fileUri = FileSystem.documentDirectory + filename;
        await FileSystem.writeAsStringAsync(fileUri, jsonStr);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const venueGroups = scheduleData.reduce((acc: any, curr: any) => {
    acc[curr.venue] = acc[curr.venue] || [];
    acc[curr.venue].push(curr);
    return acc;
  }, {});

  return (
    <ScrollView className="flex-1 bg-ssf-bg py-6 px-4">
      <View className="flex-row items-center mb-6">
        <TouchableOpacity onPress={goBack} className="p-2 mr-2 bg-ssf-surface rounded-full border border-ssf-border">
          <ArrowLeft size={24} color="#333" />
        </TouchableOpacity>
        <Text className="text-3xl font-poppins-black text-ssf-text">Import Schedules</Text>
      </View>

      <SsfCard className="mb-6 bg-blue-50 border border-blue-200">
        <Text className="font-poppins-bold text-blue-800 mb-2">Schedule Import Safety Rules</Text>
        <Text className="font-poppins text-xs text-blue-700 leading-5">
          • Double scheduling is blocked in the database via Unique Constraints.{'\n'}
          • Overlap checking prevents booking the same venue for different events at the same time.{'\n'}
          • Conflicting events are highlighted in RED.{'\n'}
          • Safe partial import continues importing non-conflicting rows.
        </Text>
      </SsfCard>

      {scheduleData.length === 0 ? (
        <SsfCard className="p-8 items-center border-dashed border-2 border-ssf-border mb-6">
          <Upload size={48} color="#64748B" className="mb-4" />
          <Text className="font-poppins-bold text-lg text-ssf-text mb-2">Upload Schedule JSON</Text>
          <Text className="font-poppins text-xs text-ssf-text-muted text-center mb-6 max-w-xs">
            Select the JSON file containing the off-stage/on-stage schedule slots.
          </Text>
          
          {Platform.OS === 'web' ? (
            <input 
              type="file" 
              accept=".json" 
              onChange={handleFileUpload} 
              style={{
                fontFamily: 'Poppins_600SemiBold',
                backgroundColor: '#065F46',
                color: '#fff',
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer'
              }}
            />
          ) : (
            <Text className="text-xs text-red-500 font-poppins">Please upload via web browser dashboard.</Text>
          )}
        </SsfCard>
      ) : (
        <>
          <View className="flex-row gap-4 mb-6">
            <SsfCard className="flex-1 items-center py-4">
              <Calendar size={24} color="#065F46" className="mb-2" />
              <Text className="font-poppins-bold text-2xl">{scheduleData.length}</Text>
              <Text className="font-poppins text-xs text-ssf-text-muted">Total Events</Text>
            </SsfCard>
            <SsfCard className="flex-1 items-center py-4">
              <Database size={24} color="#065F46" className="mb-2" />
              <Text className="font-poppins-bold text-2xl">{Object.keys(venueGroups).length}</Text>
              <Text className="font-poppins text-xs text-ssf-text-muted">Venues Utilized</Text>
            </SsfCard>
          </View>

          {/* Dry Run Validation Card */}
          <SsfCard className="mb-6">
            <Text className="font-poppins-bold text-lg mb-4 text-ssf-text">Import dry-run Pre-Validation</Text>
            
            {!dryRunReport ? (
              <View className="items-center py-4">
                <Text className="font-poppins text-sm text-ssf-text-muted mb-4">Please validate your schedule against database parameters (item names, categories, venues, and timings).</Text>
                <SsfButton 
                  label={isDryRunning ? "Validating..." : "Run Pre-Validation Dry-Run"} 
                  onPress={runDryRunValidation} 
                  disabled={isDryRunning}
                />
              </View>
            ) : (
              <View>
                {dryRunReport.isValid ? (
                  <View className="flex-row items-center bg-green-50 p-4 rounded-xl border border-green-200 mb-4">
                    <CheckCircle size={24} color="#15803d" className="mr-3" />
                    <View className="flex-1">
                      <Text className="font-poppins-bold text-green-800">Validation Passed</Text>
                      <Text className="font-poppins text-xs text-green-700">No time overlaps, venue mismatch, or category conflicts. Safe to import!</Text>
                    </View>
                  </View>
                ) : (
                  <View className="bg-red-50 p-4 rounded-xl border border-red-200 mb-4">
                    <View className="flex-row items-center mb-2">
                      <AlertCircle size={24} color="#b91c1c" className="mr-3" />
                      <Text className="font-poppins-bold text-red-800">Errors & Conflicts Detected</Text>
                    </View>
                    {dryRunReport.errors.map((err: string, i: number) => (
                      <Text key={i} className="font-poppins text-xs text-red-700 mb-1">• {err}</Text>
                    ))}
                    {dryRunReport.conflicts.map((conf: any, i: number) => (
                      <Text key={i} className="font-poppins text-xs text-red-800 font-poppins-bold mb-1">• Overlap (Row {conf.row}): [${conf.item_code}] ${conf.item_name} at ${conf.venue} overlaps with ${conf.conflict_with}</Text>
                    ))}
                    
                    <SsfButton 
                      label="Download Conflict Report" 
                      variant="outline" 
                      className="mt-4" 
                      onPress={downloadConflictReport} 
                    />
                  </View>
                )}

                <View className="flex-row gap-4 mt-4">
                  <SsfButton 
                    label="Reset JSON" 
                    variant="outline" 
                    className="flex-1" 
                    onPress={() => { setScheduleData([]); setInternalValidation(null); setDryRunReport(null); setImportReport(null); }} 
                  />
                  <SsfButton 
                    label={isProcessing ? `${progress}% Processing...` : "Run Production Import"} 
                    className="flex-1" 
                    onPress={executeImport} 
                    disabled={(!dryRunReport.isValid && dryRunReport.conflicts.length > 0) || isProcessing} 
                  />
                </View>
              </View>
            )}
          </SsfCard>

          {/* Grouped Preview by Venue */}
          <SsfCard className="mb-6">
            <Text className="font-poppins-bold text-lg mb-4 text-ssf-text">Venue Grouped Timetable Preview</Text>
            {Object.keys(venueGroups).map((venue: string) => (
              <View key={venue} className="mb-6 last:mb-0 border-b border-ssf-border last:border-0 pb-4 last:pb-0">
                <Text className="font-poppins-bold text-ssf-primary mb-2 text-md">{venue}</Text>
                {venueGroups[venue].map((s: any, idx: number) => (
                  <View key={idx} className="flex-row justify-between items-center py-2 border-b border-slate-100 last:border-0">
                    <View className="flex-1 pr-4">
                      <Text className="font-poppins-bold text-xs">[{s.item_code}] {s.item_name}</Text>
                      <Text className="font-poppins text-xs text-ssf-text-muted">{s.category} • {s.section}</Text>
                    </View>
                    <View className="items-end">
                      <Text className="font-poppins-bold text-xs text-slate-800">{s.start_time} - {s.end_time}</Text>
                      <Text className="font-poppins text-xs text-ssf-text-muted">{s.date}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </SsfCard>
        </>
      )}

      {/* Reports Card */}
      {importReport ? (
        <SsfCard className="mb-6">
          <Text className="font-poppins-bold text-lg mb-4 text-ssf-text">Import Success Report</Text>
          <View style={{ gap: 12 }}>
            <View className="flex-row justify-between border-b border-ssf-border pb-2">
              <Text className="font-poppins text-sm text-ssf-text-muted">Imported/Scheduled Items:</Text>
              <Text className="font-poppins-bold text-sm text-green-700">{importReport.imported_count}</Text>
            </View>
            <View className="flex-row justify-between border-b border-ssf-border pb-2">
              <Text className="font-poppins text-sm text-ssf-text-muted">Skipped/Duplicate Slots:</Text>
              <Text className="font-poppins-bold text-sm text-ssf-text">{importReport.skipped_count}</Text>
            </View>
            <View className="flex-row justify-between border-b border-ssf-border pb-2">
              <Text className="font-poppins text-sm text-ssf-text-muted">Overlap Conflicts Blocked:</Text>
              <Text className="font-poppins-bold text-sm text-red-600">{importReport.conflict_count}</Text>
            </View>
            <View className="flex-row justify-between border-b border-ssf-border pb-2">
              <Text className="font-poppins text-sm text-ssf-text-muted">Execution Duration:</Text>
              <Text className="font-poppins-bold text-sm text-ssf-text">{importReport.execution_time}</Text>
            </View>

            {importReport.errors?.length > 0 || importReport.conflicts?.length > 0 ? (
              <SsfButton 
                label="Download Conflict Report" 
                variant="outline" 
                className="mt-4" 
                onPress={downloadConflictReport} 
              />
            ) : null}
          </View>
        </SsfCard>
      ) : null}
    </ScrollView>
  );
}
