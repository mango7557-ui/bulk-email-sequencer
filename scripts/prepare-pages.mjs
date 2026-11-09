import { cp, readdir, readFile, rm } from 'node:fs/promises';

// Publish only the generated frontend bundle; preserve the workflow example.
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
if (!html.includes('./assets/')) throw new Error('Expected Vite relative asset URLs');
for (const name of await readdir(new URL('../docs/assets/', import.meta.url))) {
  if (/^index-[\w-]+\.(js|css)$/.test(name)) {
    await rm(new URL(`../docs/assets/${name}`, import.meta.url));
  }
}
await cp(new URL('../dist/', import.meta.url), new URL('../docs/', import.meta.url), { recursive: true });
console.log('GitHub Pages bundle prepared in docs/');
