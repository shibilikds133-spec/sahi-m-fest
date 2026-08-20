import * as React from "react";
import { TextInput, TextInputProps } from "react-native";
import { cn } from "../../../lib/utils";

const Input = React.forwardRef<TextInput, TextInputProps>(
  ({ className, ...props }, ref) => {
    return (
      <TextInput
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-poppins text-foreground placeholder:text-muted-foreground",
          className
        )}
        placeholderTextColor="#94A3B8"
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
