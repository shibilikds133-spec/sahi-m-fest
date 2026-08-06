import * as React from "react";
import { Text, View } from "react-native";
import { cn } from "../../../lib/utils";

const badgeVariants = {
  default: "bg-ui-primary",
  secondary: "bg-ui-muted",
  destructive: "bg-red-500",
  outline: "border border-ui-border bg-transparent",
  success: "bg-emerald-100",
  warning: "bg-amber-100",
  info: "bg-blue-100",
};

const textVariants = {
  default: "text-white",
  secondary: "text-ui-text",
  destructive: "text-white",
  outline: "text-ui-text",
  success: "text-emerald-800",
  warning: "text-amber-800",
  info: "text-blue-800",
};

export interface BadgeProps {
  variant?: keyof typeof badgeVariants;
  className?: string;
  children: React.ReactNode;
}

function Badge({ variant = "default", className, children }: BadgeProps) {
  return (
    <View
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5",
        badgeVariants[variant],
        className
      )}
    >
      <Text className={cn("text-xs font-medium", textVariants[variant])}>
        {children}
      </Text>
    </View>
  );
}

export { Badge, badgeVariants };
