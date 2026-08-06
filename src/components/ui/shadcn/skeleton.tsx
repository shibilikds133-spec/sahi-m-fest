import * as React from "react";
import { View } from "react-native";
import { cn } from "../../../lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<typeof View>) {
  return (
    <View
      className={cn("rounded-md bg-ui-muted animate-pulse", className)}
      {...props}
    />
  );
}

export { Skeleton };
