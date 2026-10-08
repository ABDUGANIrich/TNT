// Optional content resource. The installer never imports or executes this file.
import { readFile } from 'node:fs/promises';
const file = process.argv[2];
if (!file) throw new Error('Usage: node json-keys.mjs <local-json-file>');
const data = JSON.parse(await readFile(file, 'utf8'));
if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Expected a JSON object');
console.log(Object.keys(data).sort().join('\n'));
