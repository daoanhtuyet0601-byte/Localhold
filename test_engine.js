const fs = require('fs');
const { B2BSalesAgentEngine } = require('./agent_engine.js');

const catalog = JSON.parse(fs.readFileSync('./catalog_and_policy.json', 'utf8'));
const engine = new B2BSalesAgentEngine(catalog);

// Parse CSV simple
const csvText = fs.readFileSync('./sample_b2b_opportunities.csv', 'utf8');
const lines = csvText.split('\n').filter(l => l.trim().length > 0);
const headers = lines[0].split(',');

function parseCSVLine(line) {
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

const records = [];
for (let i = 1; i < lines.length; i++) {
  const values = parseCSVLine(lines[i]);
  const row = {};
  headers.forEach((h, idx) => {
    row[h.trim()] = values[idx] || '';
  });
  records.push(row);
}

console.log(`Đã đọc ${records.length} cơ hội từ CSV.`);
const output = engine.processBatch(records);
console.log('--- KẾT QUẢ TỔNG HỢP (SUMMARY) ---');
console.log(JSON.stringify(output.summary, null, 2));

console.log('\n--- CHI TIẾT TỪNG CƠ HỘI ---');
output.opportunities.forEach((op, idx) => {
  console.log(`\n[${idx + 1}] Mã: ${op.id} | Khách: ${op.customer} | Trạng thái: ${op.status}`);
  if (op.finalProposedAmount) {
    console.log(`    Giá trị đề xuất: ${op.finalProposedAmount.toLocaleString('vi-VN')} VNĐ (Chiết khấu: ${op.appliedDiscountPct}%)`);
  }
  if (op.missingFields && op.missingFields.length > 0) {
    console.log(`    Thiếu: ${op.missingFields.join(', ')}`);
  }
  if (op.approvalReasons && op.approvalReasons.length > 0) {
    console.log(`    Căn cứ chuyển duyệt: ${op.approvalReasons.join('; ')}`);
  }
  if (op.rejectionReasons && op.rejectionReasons.length > 0) {
    console.log(`    Lý do chưa đáp ứng: ${op.rejectionReasons.join('; ')}`);
  }
  console.log(`    Bước tiếp theo: ${op.nextSteps[0]}`);
});
