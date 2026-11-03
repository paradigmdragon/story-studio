import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(root, '.openai/hosting.json'), 'utf8'));
if (!manifest.project_id || manifest.static?.directory !== 'dist') {
  throw new Error('Existing Sites project identity and dist directory are required.');
}
const dist = resolve(root, manifest.static.directory);
const html = await readFile(resolve(dist, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
  const url = match[1];
  if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(url)) continue;
  const file = resolve(dist, decodeURIComponent(url.split(/[?#]/)[0]));
  const rel = relative(dist, file);
  if (rel === '..' || rel.startsWith('..' + sep)) throw new Error('Asset escapes dist: ' + url);
  if (!(await stat(file)).isFile()) throw new Error('Missing asset: ' + url);
}
for (const file of ['app.js', 'style.css', 'panel-1.jpg', 'panel-2.jpg', 'panel-3.jpg', 'comic.jpg']) {
  if (!(await stat(resolve(dist, file))).isFile()) throw new Error('Missing source asset: ' + file);
}
console.log('Source syntax, HTML asset references and Sites manifest verified.');
