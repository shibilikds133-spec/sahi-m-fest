const fs = require("fs");
const filePath = "src/app/(admin)/smart-announcer/index.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  "import { View, Text, StyleSheet, ActivityIndicator, Pressable, ScrollView, Alert } from 'react-native';",
  "import { View, Text, StyleSheet, ActivityIndicator, Pressable, ScrollView, Alert, TouchableOpacity } from 'react-native';"
);

// Also add is_public to StrategicResult interface if missing
if (!content.includes("is_public: boolean;")) {
  content = content.replace(
    "leader_name: string;",
    "leader_name: string;\n  is_public: boolean;"
  );
}

fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed imports in smart-announcer");
