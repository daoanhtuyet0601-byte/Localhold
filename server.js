const http = require('http');
const fs = require('fs');
const path = require('path');
const { B2BSalesAgentEngine } = require('./agent_engine.js');

const PORT = 3000;
const catalogData = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalog_and_policy.json'), 'utf8'));
const engine = new B2BSalesAgentEngine(catalogData);

// Helper for CSV Parsing
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  function parseLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    return result;
  }

  const headers = parseLine(lines[0]);
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length > 1) {
      const row = {};
      headers.forEach((h, idx) => {
        row[h.trim()] = values[idx] || '';
      });
      records.push(row);
    }
  }
  return records;
}

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // 1. API: Process Batch of Opportunities
  if (req.method === 'POST' && pathname === '/api/process') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        let records = [];
        const contentType = req.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          const parsed = JSON.parse(body);
          records = Array.isArray(parsed) ? parsed : (parsed.records || [parsed]);
        } else {
          // Assume raw CSV
          records = parseCSV(body);
        }

        const result = engine.processBatch(records);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result, null, 2));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 2. API: Get Catalog & Policies
  if (req.method === 'GET' && pathname === '/api/catalog') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(catalogData, null, 2));
    return;
  }

  // 3. API: Get Sample Test CSV
  if (req.method === 'GET' && pathname === '/api/sample') {
    const csvContent = fs.readFileSync(path.join(__dirname, 'sample_b2b_opportunities.csv'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(csvContent);
    return;
  }

  // 4. Serve index.html or static files
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(__dirname, 'index.html');
  }

  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  const contentType = mimeTypes[ext] || 'text/plain; charset=utf-8';
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end('Error loading ' + filePath);
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`B2B Sales Agent Server is running at http://localhost:${PORT}`);
});

