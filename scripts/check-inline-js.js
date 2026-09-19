const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*type=["']module["'])[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .filter(code => code.trim());

if (!scripts.length) throw new Error('No classic inline scripts found');
const temp = path.join(os.tmpdir(), `douyin-launcher-inline-${process.pid}.js`);
fs.writeFileSync(temp, scripts.join('\n;\n'));
const result = spawnSync(process.execPath, ['--check', temp], { encoding: 'utf8' });
fs.unlinkSync(temp);
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status || 1);
}
console.log(`Inline JavaScript parsed (${scripts.length} script blocks).`);
