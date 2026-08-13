// Packages the Vite build into one self-contained HTML file (inline JS+CSS).
import { readFileSync, writeFileSync, readdirSync } from 'fs';

const outPath = process.argv[2] || 'dist/kreft-single.html';
let html = readFileSync('dist/index.html', 'utf8');
const assets = readdirSync('dist/assets');
const jsFile = assets.find(f => f.endsWith('.js'));
const cssFile = assets.find(f => f.endsWith('.css'));

let js = readFileSync('dist/assets/' + jsFile, 'utf8');
js = js.replaceAll('</script', '<\\/script'); // keep inline script parseable
const css = readFileSync('dist/assets/' + cssFile, 'utf8');

// use function replacers: string replacements would expand $-patterns in the bundle
html = html.replace(/<script type="module"[^>]*><\/script>/, () => '');
html = html.replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${css}\n</style>`);
html = html.replace('</body>', () => `<script type="module">\n${js}\n</script>\n</body>`);
html = html.replace(/<title>[^<]*<\/title>/, () => '<title>KREFT</title>');

writeFileSync(outPath, html);
console.log('wrote', outPath, (html.length / 1024).toFixed(0) + 'KB');
