import React from 'react';
import { View, ViewProps } from 'react-native';

export const SsfCard: React.FC<ViewProps> = ({ className = '', children, ...props }) => {
 return (
  <View
    className={`bg-ssf-surface rounded-3xl shadow-sm border border-slate-100 p-6 ${className}`}
    {...props}
  >
    {children}
  </View>
 );
};
