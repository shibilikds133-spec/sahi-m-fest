const fs = require('fs');
let code = fs.readFileSync('src/components/publicLanding/SahithyolsavLandingPage.web.tsx', 'utf8');

// View Leaderboard buttons
code = code.replace(/<button className="hover-lift[^>]*>\s*<span className="material-symbols-outlined">emoji_events<\/span>\s*View Leaderboard\s*<\/button>/g, 
  (match) => match.replace('<button', '<button onClick={() => window.location.href = "/leaderboard"}'));

// Login buttons
code = code.replace(/<button className="hidden md:block[^>]*>Login<\/button>/g, 
  (match) => match.replace('<button', '<button onClick={() => window.location.href = "/login"}'));
  
// Register buttons
code = code.replace(/<button className="hover-lift bg-alviora-primary[^>]*>Register<\/button>/g, 
  (match) => match.replace('<button', '<button onClick={() => window.location.href = "/login"}'));

fs.writeFileSync('src/components/publicLanding/SahithyolsavLandingPage.web.tsx', code);
console.log('landing page links updated');
