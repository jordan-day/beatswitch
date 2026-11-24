// Turns the Vite build (dist/index.html) into the page body a Claude artifact expects:
// no <!doctype>/<html>/<head>/<body> of its own (the host wraps it), a <title> first,
// and the built CSS/JS referenced as files published next to the page.
import { readFileSync, writeFileSync } from 'node:fs';

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
writeFileSync('dist/artifact-files.json', JSON.stringify({ [script]: `dist/${script}`, [css]: `dist/${css}` }, null, 2));
console.log('artifact page: dist/artifact.html');
console.log('files:', script, css);
