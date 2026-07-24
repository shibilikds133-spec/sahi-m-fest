import React from 'react';
import { View, Text } from 'react-native';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  leftComponent?: React.ReactNode;
  rightComponent?: React.ReactNode;
}

export function PageHeader({ title, subtitle, leftComponent, rightComponent }: PageHeaderProps) {
  return (
    <View className="bg-white px-5 pt-12 pb-5 rounded-b-3xl shadow-sm z-10 flex-row items-center border-b border-gray-100">
      {leftComponent && <View>{leftComponent}</View>}
      <View className="flex-1 justify-center">
        <Text className="text-xl font-poppins-black text-gray-900">{title}</Text>
        {subtitle && <Text className="text-sm font-poppins text-gray-500 mt-1">{subtitle}</Text>}
      </View>
      {rightComponent && <View>{rightComponent}</View>}
    </View>
  );
}
