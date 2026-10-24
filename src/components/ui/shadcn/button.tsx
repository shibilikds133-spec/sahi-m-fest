import * as React from "react";
import { TouchableOpacity, Text, ActivityIndicator } from "react-native";
import { cn } from "../../../lib/utils";

const variantStyles = {
  default: "bg-[#0F766E]",
  destructive: "bg-destructive",
  outline: "border border-[#B7D9D3] bg-[#E7F6F3]",
  secondary: "bg-[#E7F6F3]",
  ghost: "bg-transparent",
  link: "bg-transparent",
};

const sizeStyles = {
  default: "h-10 px-4 py-2",
  sm: "h-8 px-3",
  lg: "h-12 px-8",
  icon: "h-10 w-10",
};

const textVariantStyles = {
  default: "text-white",
  destructive: "text-destructive-foreground",
  outline: "text-[#0F172A]",
  secondary: "text-[#0F766E]",
  ghost: "text-foreground",
  link: "text-primary",
};

export interface ButtonProps {
  variant?: keyof typeof variantStyles;
  size?: keyof typeof sizeStyles;
  className?: string;
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  brandPalette?: { primary: string; surface: string; surfaceSoft: string; border: string };
}

const Button = React.forwardRef<React.ElementRef<typeof TouchableOpacity>, ButtonProps>(
  ({ className, variant = "default", size = "default", children, onPress, disabled, loading, brandPalette, ...props }, ref) => {
    return (
      <TouchableOpacity
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium",
          variantStyles[variant],
          sizeStyles[size],
          disabled && "opacity-50",
          className
        )}
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.7}
        style={brandPalette ? {
          backgroundColor: variant === 'default' ? brandPalette.primary : variant === 'outline' || variant === 'secondary' ? brandPalette.surfaceSoft : undefined,
          borderColor: variant === 'outline' ? brandPalette.border : undefined,
        } : undefined}
        {...props}
      >
        {loading ? (
          <ActivityIndicator size="small" color={variant === "default" ? "white" : "#0F766E"} />
        ) : (
          <Text className={cn("text-sm font-medium", textVariantStyles[variant])} style={brandPalette && (variant === 'outline' || variant === 'secondary') ? { color: brandPalette.primary } : undefined}>
            {children}
          </Text>
        )}
      </TouchableOpacity>
    );
  }
);
Button.displayName = "Button";

export { Button, variantStyles as buttonVariants };
