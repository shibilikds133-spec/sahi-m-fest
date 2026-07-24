import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../../../core/config/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';

type Provider = 'gemini' | 'llama' | 'openai' | 'anthropic';

interface ApiKey {
  id: string;
  provider: Provider;
  key_value: string;
  is_active: boolean;
  created_at: string;
}

export default function ApiKeysSettingsScreen() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  
  // New Key Form State
  const [newKey, setNewKey] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<Provider>('gemini');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('system_api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      // Ignore if table doesn't exist yet, we will prompt user to run SQL
      console.warn('Error fetching API keys:', error);
    } else {
      setApiKeys(data || []);
    }
    setLoading(false);
  };

  const handleAddKey = async () => {
    if (!newKey.trim()) {
      Alert.alert('Error', 'Please enter an API Key');
      return;
    }

    setIsAdding(true);
    const { error } = await supabase
      .from('system_api_keys')
      .insert([{ provider: selectedProvider, key_value: newKey.trim(), is_active: true }]);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setNewKey('');
      fetchApiKeys();
      Alert.alert('Success', 'API Key added successfully');
    }
    setIsAdding(false);
  };

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('system_api_keys')
      .update({ is_active: !currentStatus })
      .eq('id', id);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      fetchApiKeys();
    }
  };

  const deleteKey = async (id: string) => {
    Alert.alert(
      'Delete Key',
      'Are you sure you want to delete this API Key?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('system_api_keys').delete().eq('id', id);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              fetchApiKeys();
            }
          }
        }
      ]
    );
  };

  return (
    <ScrollView className="flex-1 bg-gray-50 p-4">
      <Stack.Screen options={{ title: 'AI API Keys' }} />
      
      <View className="bg-white p-6 rounded-xl shadow-sm mb-6">
        <Text className="text-lg font-bold text-gray-800 mb-4">Add New API Key</Text>
        
        <Text className="text-gray-600 mb-2 font-medium">Select Provider</Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {(['gemini', 'openai', 'anthropic'] as Provider[]).map(provider => (
            <TouchableOpacity
              key={provider}
              onPress={() => setSelectedProvider(provider)}
              className={`px-4 py-2 rounded-full border ${selectedProvider === provider ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-300'}`}
            >
              <Text className={`${selectedProvider === provider ? 'text-white' : 'text-gray-600'} capitalize font-medium`}>
                {provider}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text className="text-gray-600 mb-2 font-medium">API Key</Text>
        <TextInput
          className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-gray-800"
          placeholder={`Enter your ${selectedProvider.toUpperCase()} API Key`}
          value={newKey}
          onChangeText={setNewKey}
          secureTextEntry
        />

        <TouchableOpacity 
          className="bg-primary-600 p-4 rounded-xl items-center flex-row justify-center"
          onPress={handleAddKey}
          disabled={isAdding}
        >
          {isAdding ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={20} color="white" className="mr-2" />
              <Text className="text-white font-bold ml-2">Save Key</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Text className="text-lg font-bold text-gray-800 mb-4">Manage Active Keys</Text>
      
      {loading ? (
        <ActivityIndicator size="large" color="#0ea5e9" className="mt-8" />
      ) : apiKeys.length === 0 ? (
        <View className="bg-white p-6 rounded-xl shadow-sm items-center">
          <Ionicons name="key-outline" size={48} color="#cbd5e1" />
          <Text className="text-gray-500 mt-4 text-center">No API Keys found in the database. The system is currently using fallback .env keys.</Text>
        </View>
      ) : (
        apiKeys.map((key) => (
          <View key={key.id} className="bg-white p-4 rounded-xl shadow-sm mb-3 flex-row items-center justify-between">
            <View className="flex-1">
              <View className="flex-row items-center mb-1">
                <Text className="font-bold text-gray-800 capitalize text-lg">{key.provider === 'llama' ? 'Llama (Groq)' : key.provider}</Text>
                <View className={`ml-3 px-2 py-1 rounded-full ${key.is_active ? 'bg-green-100' : 'bg-gray-100'}`}>
                  <Text className={`text-xs font-bold ${key.is_active ? 'text-green-700' : 'text-gray-500'}`}>
                    {key.is_active ? 'ACTIVE' : 'INACTIVE'}
                  </Text>
                </View>
              </View>
              <Text className="text-gray-500 font-mono text-sm" numberOfLines={1}>
                {key.key_value.substring(0, 8)}••••••••••••{key.key_value.substring(key.key_value.length - 4)}
              </Text>
            </View>
            
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => toggleStatus(key.id, key.is_active)} className="p-2 bg-gray-50 rounded-full">
                <Ionicons name={key.is_active ? "pause-outline" : "play-outline"} size={20} color={key.is_active ? "#f59e0b" : "#10b981"} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteKey(key.id)} className="p-2 bg-red-50 rounded-full">
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
      
      <View className="h-10" />
    </ScrollView>
  );
}
