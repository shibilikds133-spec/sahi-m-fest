const fs = require('fs');
let code = fs.readFileSync('tailwind.config.js', 'utf8');

const typography = `
      fontFamily: {
        "headline-lg": ["Plus Jakarta Sans"],
        "display-xl": ["Plus Jakarta Sans"],
        "headline-lg-mobile": ["Plus Jakarta Sans"],
        "body-lg": ["Manrope"],
        "body-md": ["Manrope"],
        "display-xl-mobile": ["Plus Jakarta Sans"],
        "title-md": ["Plus Jakarta Sans"],
        "label-sm": ["Space Grotesk"]
      },
      fontSize: {
        "headline-lg": ["40px", { "lineHeight": "1.2", "fontWeight": "700" }],
        "display-xl": ["80px", { "lineHeight": "1.1", "letterSpacing": "-0.04em", "fontWeight": "800" }],
        "headline-lg-mobile": ["32px", { "lineHeight": "1.2", "fontWeight": "700" }],
        "body-lg": ["18px", { "lineHeight": "1.6", "fontWeight": "400" }],
        "body-md": ["16px", { "lineHeight": "1.6", "fontWeight": "400" }],
        "display-xl-mobile": ["48px", { "lineHeight": "1.1", "letterSpacing": "-0.02em", "fontWeight": "800" }],
        "title-md": ["20px", { "lineHeight": "1.4", "fontWeight": "600" }],
        "label-sm": ["12px", { "lineHeight": "1", "letterSpacing": "0.1em", "fontWeight": "600" }]
      },
`;

code = code.replace('extend: {', 'extend: {' + typography);
fs.writeFileSync('tailwind.config.js', code);
console.log('tailwind typography updated');
