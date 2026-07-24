import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, TouchableOpacityProps, View } from 'react-native';

interface SsfButtonProps extends TouchableOpacityProps {
 label: string;
 variant?: 'primary' | 'outline' | 'ghost';
 size?: 'sm' | 'md' | 'lg';
 isLoading?: boolean;
 icon?: React.ReactNode;
}

export const SsfButton: React.FC<SsfButtonProps> = ({
 label,
 variant = 'primary',
 size = 'md',
 isLoading = false,
 icon,
 className = '',
 disabled,
 ...props
}) => {
 const baseClasses = 'items-center justify-center rounded-full flex-row shadow-sm active:opacity-80';
 
 const variantClasses = {
 primary: 'bg-ssf-primary',
 outline: 'border border-ssf-primary bg-transparent',
 ghost: 'bg-transparent shadow-none',
 };

 const sizeClasses = {
 sm: 'py-2 px-5',
 md: 'py-3 px-8',
 lg: 'py-4 px-10',
 };

 const textVariantClasses = {
 primary: 'text-white',
 outline: 'text-ssf-primary',
 ghost: 'text-ssf-primary',
 };

 const textSizeClasses = {
 sm: 'text-sm',
 md: 'text-base',
 lg: 'text-lg',
 };

 const isDisabled = disabled || isLoading;

 return (
 <TouchableOpacity
 className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${isDisabled ? 'opacity-50' : ''} ${className}`}
 disabled={isDisabled}
 {...props}
 >
 {isLoading ? (
 <ActivityIndicator color={variant === 'primary' ? '#FFFFFF' : '#065F46'} className="mr-2" />
 ) : icon ? (
 <View className="mr-2">{icon}</View>
 ) : null}
 <Text className={`font-poppins-bold uppercase tracking-wider ${textVariantClasses[variant]} ${textSizeClasses[size]}`}>
 {label}
 </Text>
 </TouchableOpacity>
 );
};
