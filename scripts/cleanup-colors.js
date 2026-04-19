const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

const replacements = [
  // Common hardcoded slate colors to semantic
  [/text-slate-900/g, 'text-foreground'],
  [/text-slate-800/g, 'text-foreground'],
  [/text-slate-700/g, 'text-foreground'],
  [/text-slate-600/g, 'text-secondary-foreground'],
  [/text-slate-500/g, 'text-muted-foreground'],
  [/text-slate-400/g, 'text-muted-foreground'],
  [/border-slate-200/g, 'border-border'],
  [/border-slate-100/g, 'border-border/50'],
  [/bg-slate-200/g, 'bg-muted'],
  [/bg-slate-100/g, 'bg-muted'],
  [/bg-slate-50/g, 'bg-background'],
  [/bg-white/g, 'bg-card'],
  [/text-white/g, 'text-primary-foreground'],
  
  // Primary / Indigo / Emerald overrides
  [/bg-indigo-600 hover:bg-indigo-700/g, 'bg-primary hover:bg-primary/90'],
  [/bg-indigo-600/g, 'bg-primary'],
  [/bg-emerald-600 hover:bg-emerald-700/g, 'bg-primary hover:bg-primary/90'],
  [/bg-emerald-600/g, 'bg-primary'],
  [/bg-blue-600 hover:bg-blue-700/g, 'bg-primary hover:bg-primary/90'],
  [/bg-blue-600/g, 'bg-primary'],
  
  [/text-indigo-500/g, 'text-primary'],
  [/text-emerald-500/g, 'text-primary'],
  [/text-emerald-700/g, 'text-primary'],
  [/text-blue-500/g, 'text-primary'],
  [/text-blue-600/g, 'text-primary'],
  [/text-indigo-600/g, 'text-primary'],
  [/text-emerald-600/g, 'text-primary'],

  [/hover:text-indigo-800/g, 'hover:text-primary/80'],
  [/hover:text-emerald-800/g, 'hover:text-primary/80'],
  [/hover:text-blue-800/g, 'hover:text-primary/80'],

  [/border-indigo-500/g, 'border-primary'],
  [/border-emerald-500/g, 'border-primary'],
  [/border-blue-500/g, 'border-primary'],
  
  [/ring-indigo-500/g, 'ring-primary'],
  [/ring-emerald-500/g, 'ring-primary'],
  [/ring-blue-500/g, 'ring-primary'],

  // Specific groups
  [/hover:border-blue-300 hover:bg-blue-50\/50/g, 'hover:border-primary/50 hover:bg-muted'],
  [/bg-blue-100/g, 'bg-muted'],
  [/group-hover:text-blue-600/g, 'group-hover:text-primary'],
  
  [/hover:border-emerald-300 hover:bg-emerald-50\/50/g, 'hover:border-primary/50 hover:bg-muted'],
  [/bg-emerald-100/g, 'bg-muted'],
  [/group-hover:text-emerald-600/g, 'group-hover:text-primary'],

  [/hover:border-indigo-300 hover:bg-indigo-50\/50/g, 'hover:border-primary/50 hover:bg-muted'],
  [/bg-indigo-100/g, 'bg-muted'],
  [/group-hover:text-indigo-600/g, 'group-hover:text-primary'],

  [/hover:border-rose-300 hover:bg-rose-50\/50/g, 'hover:border-primary/50 hover:bg-muted'],
  [/bg-rose-100/g, 'bg-muted'],
  [/group-hover:text-rose-600/g, 'group-hover:text-primary'],
  [/text-rose-700/g, 'text-foreground'],
  [/text-rose-400/g, 'text-muted-foreground'],
  [/text-rose-600/g, 'text-primary'],

  [/hover:border-amber-300 hover:bg-amber-50\/50/g, 'hover:border-primary/50 hover:bg-muted'],
  [/bg-amber-100/g, 'bg-muted'],
  [/group-hover:text-amber-600/g, 'group-hover:text-primary'],
  [/text-amber-600/g, 'text-primary'],
  
  [/bg-slate-900 hover:bg-slate-800/g, 'bg-primary hover:bg-primary/90'],
  [/bg-slate-900/g, 'bg-primary'],
  [/border-slate-300/g, 'border-border']
];

function processFile(filePath) {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
  // Exclude node_modules and .next just in case
  if (filePath.includes('node_modules') || filePath.includes('.next')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
  }

  // Handle specific badge/status colors to neutral/muted
  // active -> text-primary
  // completed -> text-secondary-foreground
  // overdue -> text-destructive

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    console.log('Updated:', filePath);
  }
}

walkDir(path.join(__dirname, '../app'), processFile);
walkDir(path.join(__dirname, '../components'), processFile);

console.log('Finished updating all pages with semantic colors');
