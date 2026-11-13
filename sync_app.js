// Copy HTML app into workspace root for easy user opening in browser
const fs = require('fs');
const content = fs.readFileSync('/Users/daoanhtuyet/.gemini/antigravity/brain/2d41ef35-fd42-410c-b867-a9dc487a6e4d/b2b_agent_app.html', 'utf8');
fs.writeFileSync('./index.html', content);
console.log('index.html synced to workspace!');

