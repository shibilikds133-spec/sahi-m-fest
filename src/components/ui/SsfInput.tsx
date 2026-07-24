import React, { useState } from 'react';
import { View, Text, TextInput, TextInputProps, TouchableOpacity } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';

interface SsfInputProps extends TextInputProps {
  label?: string;
  error?: string;
  showToggle?: boolean; // enable show/hide for password fields
}

export const SsfInput: React.FC<SsfInputProps> = ({
  label,
  error,
  className = '',
  showToggle = false,
  secureTextEntry,
  ...props
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <View className={`mb-4 ${className}`}>
      {label && (
        <Text className="text-slate-800 font-poppins text-sm mb-1">
          {label}
        </Text>
      )}
      <View style={{ position: 'relative', flexDirection: 'row', alignItems: 'center' }}>
        <TextInput
          className={`flex-1 bg-white border ${
            error ? 'border-red-500' : 'border-gray-300'
          } rounded-lg px-4 py-3 text-slate-800 font-poppins`}
          style={{ paddingRight: showToggle ? 48 : 16 }}
          placeholderTextColor="#9ca3af"
          secureTextEntry={showToggle ? !visible : secureTextEntry}
          {...props}
        />
        {showToggle && (
          <TouchableOpacity
            onPress={() => setVisible((v) => !v)}
            style={{
              position: 'absolute',
              right: 14,
              padding: 4,
            }}
          >
            {visible ? (
              <EyeOff size={20} color="#94a3b8" />
            ) : (
              <Eye size={20} color="#94a3b8" />
            )}
          </TouchableOpacity>
        )}
      </View>
      {error && (
        <Text className="text-red-500 font-poppins text-xs mt-1">{error}</Text>
      )}
    </View>
  );
};
