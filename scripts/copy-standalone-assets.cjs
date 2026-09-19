const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const staticSrc = path.join(projectRoot, '.next', 'static');
const staticDest = path.join(projectRoot, '.next', 'standalone', '.next', 'static');
const publicSrc = path.join(projectRoot, 'public');
const publicDest = path.join(projectRoot, '.next', 'standalone', 'public');

function copyFolderSync(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyFolderSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('[Build] Copying Next.js static assets to standalone output...');
copyFolderSync(staticSrc, staticDest);
if (fs.existsSync(publicSrc)) {
  copyFolderSync(publicSrc, publicDest);
}
console.log('[Build] Static assets copied successfully.');
