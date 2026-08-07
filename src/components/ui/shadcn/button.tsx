import * as React from "react";
import { TouchableOpacity, Text, ActivityIndicator } from "react-native";
import { cn } from "../../../lib/utils";

const variantStyles = {
  default: "bg-primary",
  destructive: "bg-destructive",
  outline: "border border-border bg-background",
  secondary: "bg-secondary",
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
  default: "text-primary-foreground",
  destructive: "text-destructive-foreground",
  outline: "text-foreground",
  secondary: "text-secondary-foreground",
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
}

const Button = React.forwardRef<React.ElementRef<typeof TouchableOpacity>, ButtonProps>(
  ({ className, variant = "default", size = "default", children, onPress, disabled, loading, ...props }, ref) => {
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
        {...props}
      >
        {loading ? (
          <ActivityIndicator size="small" color={variant === "default" ? "white" : "#0F766E"} />
        ) : (
          <Text className={cn("text-sm font-medium", textVariantStyles[variant])}>
            {children}
          </Text>
        )}
      </TouchableOpacity>
    );
  }
);
Button.displayName = "Button";

export { Button, variantStyles as buttonVariants };
