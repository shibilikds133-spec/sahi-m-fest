const fs = require("fs");
const path = require("path");

const dir = "src/app/announcer";
const content = `
import { Stack } from 'expo-router';

export default function AnnouncerLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#f8fafc' },
      }}
    />
  );
}
`;

fs.writeFileSync(path.join(dir, "_layout.tsx"), content, "utf8");
console.log("Created Announcer Layout");
