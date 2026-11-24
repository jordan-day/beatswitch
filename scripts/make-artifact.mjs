// Turns the Vite build (dist/index.html) into the page body a Claude artifact expects:
// no <!doctype>/<html>/<head>/<body> of its own (the host wraps it), a <title> first,
// and the built CSS/JS referenced as files published next to the page.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const script = /<script[^>]*src="\.?\/?([^"]+\.js)"/.exec(html)?.[1];
const css = /<link[^>]*rel="stylesheet"[^>]*href="\.?\/?([^"]+\.css)"/.exec(html)?.[1];
if (!script || !css) throw new Error('Could not find the built script/stylesheet in dist/index.html');

const page = `<title>BeatSwitch</title>
<link rel="stylesheet" href="${css}">
<div id="root"></div>
<script type="module" src="${script}"></script>
`;
writeFileSync('dist/artifact.html', page);

// the recorded instruments (public/samples -> dist/samples) are published alongside the page
const files = { [script]: `dist/${script}`, [css]: `dist/${css}` };
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p);
    else if (/\.(wav|json)$/.test(e.name)) files[p.replace(/^dist\//, '')] = p;
  });
if (existsSync('dist/samples')) walk('dist/samples');
writeFileSync('dist/artifact-files.json', JSON.stringify(files, null, 2));
console.log('artifact page: dist/artifact.html');
console.log(`files: ${Object.keys(files).length} (page assets + samples)`);
