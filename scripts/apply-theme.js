const fs = require('fs');
const path = require('path');

const UI_DIR = path.join(__dirname, '../apps/ops-ui/src');

function findFiles(dir, filter, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findFiles(filePath, filter, fileList);
    } else if (filter.test(filePath)) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const files = findFiles(UI_DIR, /\.(tsx|ts)$/);
let modifiedCount = 0;

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  let content = original;

  // Modals & Overlays
  content = content.replace(/bg-black\/60/g, 'bg-background/80 backdrop-blur-sm');
  
  // Surfaces and cards
  content = content.replace(/bg-black\/40/g, 'bg-surface-2/90');
  content = content.replace(/bg-\[\#0b0f19\]/g, 'bg-surface');
  
  // Core colors
  content = content.replace(/bg-black(?!\/)/g, 'bg-background');
  
  // Text opacities
  content = content.replace(/text-white\/([0-9]+)/g, 'text-foreground/$1');
  content = content.replace(/text-white(?!\/)/g, 'text-foreground');
  
  // Borders
  content = content.replace(/border-white\/10/g, 'border-border/50');
  content = content.replace(/border-white\/20/g, 'border-border');
  
  // Subtle highlights
  content = content.replace(/bg-white\/5/g, 'bg-surface-2');
  content = content.replace(/bg-white\/10/g, 'bg-surface-2/80');
  content = content.replace(/bg-white\/20/g, 'bg-border/60');
  
  // Fix specific hardcoded badge colors using white
  content = content.replace(/bg-white(?!\/)/g, 'bg-foreground');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    modifiedCount++;
  }
}

console.log(`Updated ${modifiedCount} files out of ${files.length}`);
