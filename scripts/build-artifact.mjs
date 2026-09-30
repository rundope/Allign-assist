// Builds the sandboxed claude.ai Artifact variant: runs the Vite single-file build with
// VITE_TARGET=artifact, then strips the document skeleton (the Artifact host adds its own
// <!doctype>/<html>/<head>/<body>) and puts <title> first so the host picks it up.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

execSync('npx vite build --outDir dist-artifact --emptyOutDir', {
  stdio: 'inherit',
  env: { ...process.env, VITE_TARGET: 'artifact' },
});
const html = readFileSync('dist-artifact/index.html', 'utf8');
const headStart = html.indexOf('<head>') + '<head>'.length;
const headEnd = html.indexOf('</head>');
const bodyStart = html.indexOf('>', html.indexOf('<body')) + 1;
const bodyEnd = html.lastIndexOf('</body>');
if (headStart < 6 || headEnd < 0 || bodyStart < 1 || bodyEnd < 0) throw new Error('unexpected build output');
const head = html.slice(headStart, headEnd);
const body = html.slice(bodyStart, bodyEnd);
const title = head.match(/<title>[\s\S]*?<\/title>/)?.[0] ?? '<title>Align Assist</title>';
const styles = [...head.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]);
const scripts = [...head.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);
const out = [title, ...styles, body.trim(), ...scripts].join('\n');
writeFileSync('dist-artifact/align-assist.html', out);
console.log(`dist-artifact/align-assist.html  ${(out.length / 1024).toFixed(1)} kB`);
