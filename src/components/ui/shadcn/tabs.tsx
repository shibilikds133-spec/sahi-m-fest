import * as React from "react";
import { Pressable, Text, View, ScrollView } from "react-native";
import { cn } from "../../../lib/utils";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  brandPalette?: { primary: string; surface: string; surfaceSoft: string; border: string };
}

const TabsContext = React.createContext<TabsContextValue>({
  value: "",
  onValueChange: () => {},
});

function Tabs({
  value,
  onValueChange,
  className,
  brandPalette,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  brandPalette?: { primary: string; surface: string; surfaceSoft: string; border: string };
  children: React.ReactNode;
}) {
  return (
    <TabsContext.Provider value={{ value, onValueChange, brandPalette }}>
      <View className={cn("w-full", className)}>{children}</View>
    </TabsContext.Provider>
  );
}

function TabsList({ className, children }: { className?: string; children: React.ReactNode }) {
  const brandPalette = React.useContext(TabsContext).brandPalette;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className={cn(
        "flex flex-row items-center rounded-lg bg-muted p-1",
        className
      )}
      style={brandPalette ? { backgroundColor: brandPalette.surfaceSoft } : undefined}
    >
      {children}
    </ScrollView>
  );
}

function TabsTrigger({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(TabsContext);
  const isActive = ctx.value === value;

  return (
    <Pressable
      onPress={() => ctx.onValueChange(value)}
      className={cn(
        "flex-none items-center justify-center rounded-md px-3 py-1.5",
        isActive ? "bg-background shadow-sm" : "bg-transparent",
        className
      )}
      style={ctx.brandPalette && isActive ? { backgroundColor: ctx.brandPalette.surface } : undefined}
    >
      <Text
        className={cn(
          "text-sm font-medium",
          isActive ? "text-foreground" : "text-muted-foreground"
        )}
        style={ctx.brandPalette && isActive ? { color: ctx.brandPalette.primary } : undefined}
      >
        {children}
      </Text>
    </Pressable>
  );
}

function TabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(TabsContext);
  if (ctx.value !== value) return null;
  return <View className={cn("mt-2", className)}>{children}</View>;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
