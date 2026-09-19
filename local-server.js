const express = require('express');
const path = require('path');

const app = express();
const root = __dirname;
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

for (const name of ['douyin', 'flap', 'thumb', 'video']) {
  const handler = require(path.join(root, 'api', `${name}.js`));
  app.all(`/api/${name}`, (req, res) => Promise.resolve(handler(req, res)).catch(error => {
    console.error(`[api/${name}]`, error);
    if (!res.headersSent) res.status(500).json({ error: error.message || 'Internal Server Error' });
  }));
}

app.use(express.static(root, { index: 'index.html', extensions: ['html'] }));
app.use((_req, res) => res.sendFile(path.join(root, 'index.html')));

app.listen(port, '127.0.0.1', () => {
  console.log(`Douyin Flap Launcher running at http://127.0.0.1:${port}`);
});
