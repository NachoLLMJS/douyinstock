const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const files = ['index.html', 'dividends.html', 'leaderboard.html', 'docs.html'];
let total = 0;
for (const file of files) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type=["']module["'])[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(code => code.trim());
  for (let index = 0; index < scripts.length; index += 1) {
    const temp = path.join(os.tmpdir(), `zfun-inline-${process.pid}-${index}.js`);
    try {
      fs.writeFileSync(temp, scripts[index]);
      const result = spawnSync(process.execPath, ['--check', temp], { encoding: 'utf8' });
      if (result.status !== 0) {
        process.stderr.write(`${file} inline script ${index + 1}:\n${result.stderr || result.stdout}`);
        process.exit(result.status || 1);
      }
      total += 1;
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }
}
console.log(`Inline JavaScript parsed (${total} script blocks across ${files.length} pages).`);
