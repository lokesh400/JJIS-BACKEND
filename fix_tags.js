const fs = require('fs');
const path = require('path');

const files = [
  'views/partials/sidebar.ejs',
  'views/partials/navbar.ejs',
  'views/student/jee-advanced-attempt.ejs',
  'views/student/test-attempt.ejs',
  'views/register.ejs'
];

const basePath = '/home/lokesh/Desktop/jeevanjyotiinternational';

files.forEach(file => {
  const fullPath = path.join(basePath, file);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf-8');
    
    // Replace the specific HTML tags
    content = content.replace(/GARUD\s*<span class="text-garud-highlight">Classes<\/span>/g, 'Jeevan Jyoti <span class="text-garud-highlight">International School</span>');
    
    fs.writeFileSync(fullPath, content);
    console.log(`Updated ${file}`);
  } else {
    console.log(`File not found: ${file}`);
  }
});
