const fs = require('fs');
let html = fs.readFileSync('C:/Users/Admin/.gemini/antigravity/brain/a74b5e36-3c2e-404e-86e0-8cb0aecfa4f6/scratch/stitch_code.html', 'utf8');

// Extract the body content
const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
if (!bodyMatch) {
  console.log('No body found');
  process.exit(1);
}
let body = bodyMatch[1];

// HTML to JSX conversions
body = body.replace(/class=/g, 'className=');
body = body.replace(/<!--([\s\S]*?)-->/g, '{/* $1 */}');
body = body.replace(/<img([^>]*[^\/])>/g, '<img$1 />');
body = body.replace(/<input([^>]*[^\/])>/g, '<input$1 />');
body = body.replace(/<br([^>]*[^\/])>/g, '<br$1 />');
body = body.replace(/<hr([^>]*[^\/])>/g, '<hr$1 />');
body = body.replace(/<source([^>]*[^\/])>/g, '<source$1 />');
body = body.replace(/onclick/g, 'onClick');
body = body.replace(/onsubmit/g, 'onSubmit');
body = body.replace(/onchange/g, 'onChange');
body = body.replace(/tabindex/g, 'tabIndex');
body = body.replace(/stroke-width/g, 'strokeWidth');
body = body.replace(/stroke-linecap/g, 'strokeLinecap');
body = body.replace(/stroke-linejoin/g, 'strokeLinejoin');
body = body.replace(/fill-rule/g, 'fillRule');
body = body.replace(/clip-rule/g, 'clipRule');
body = body.replace(/for=/g, 'htmlFor=');
body = body.replace(/viewbox/gi, 'viewBox');
body = body.replace(/xmlns:xlink/g, 'xmlnsXlink');


// Remove any inline script tags
body = body.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

// Convert style="..." to style={{...}}
body = body.replace(/style="([^"]*)"/g, (match, p1) => {
  const parts = p1.split(';').filter(Boolean);
  const styleObj = {};
  parts.forEach(part => {
    let [key, val] = part.split(':');
    if (key && val) {
      key = key.trim().replace(/-([a-z])/g, (g) => g[1].toUpperCase());
      val = val.trim();
      styleObj[key] = val;
    }
  });
  return 'style={' + JSON.stringify(styleObj) + '}';
});

const componentCode = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function SahithyolsavLandingPage() {
  return (
    <>
      ${body}
    </>
  );
}
`;

fs.writeFileSync('src/components/publicLanding/SahithyolsavLandingPage.web.tsx', componentCode);

const nativeComponentCode = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function SahithyolsavLandingPage() {
  return (
    <View style={styles.container}>
      <Text>Sahithyolsav Landing Page (Web Version Available)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
`;
fs.writeFileSync('src/components/publicLanding/SahithyolsavLandingPage.tsx', nativeComponentCode);

console.log('Converted HTML to JSX and saved to SahithyolsavLandingPage.web.tsx and .tsx');
