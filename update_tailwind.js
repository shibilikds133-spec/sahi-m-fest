const fs = require('fs');
let code = fs.readFileSync('tailwind.config.js', 'utf8');

const alvioraColors = `
        'alviora-bg': '#ffffff',
        'alviora-surface': '#f8fafc',
        'alviora-primary': '#1C5FA8',
        'alviora-heading': '#0f172a',
        'alviora-body': '#334155',
        'alviora-border': '#e2e8f0',
        'alviora-accent': '#1C5FA8',
        'alviora-accent-dim': '#7EA3CC',
        'error-container': '#fee2e2',
        'on-error-container': '#991b1b',
`;

const spacing = `
      spacing: {
        'unit': '4px',
        'gutter': '24px',
        'margin-mobile': '16px',
        'margin-desktop': '64px',
        'container-max': '1280px',
        'section-gap': '120px'
      },
`;

code = code.replace('colors: {', 'colors: {' + alvioraColors);
code = code.replace('extend: {', 'extend: {' + spacing);

fs.writeFileSync('tailwind.config.js', code);
console.log('tailwind config updated');
