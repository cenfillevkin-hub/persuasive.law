import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';

const app = express();
const PORT = 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve frontend folder
app.use(express.static(path.join('../frontend')));

// Path to data file
const dataPath = path.join('../data/case_1.json');

// Function to generate color based on law-point + fact-point
function getColor(factPoint, lawPoint) {
  if (!factPoint || factPoint.toLowerCase().includes('not discussed')) {
    return '#fff9c4'; // light yellow
  }

  const law = (lawPoint || '').toLowerCase();

  // Red light law-points
  const isRed =
    law.includes('unenforceable') ||
    law.includes('unreasonable') ||
    law.includes('involuntary termination');

  // Green law-points
  const isGreen = law.includes('voluntary termination');

  // Default green for other actionable
  const baseColor = isRed ? '#f87171' : isGreen ? '#bbf7d0' : '#4ade80';

  // Add subtle tone variation if fact-point changes
  const offset = Math.min(factPoint.length % 30, 30);
  const shadeOffset = factPoint.length % 2 === 0 ? offset : -offset;

  // Function to lighten/darken hex color
  const adjustHex = (hex, percent) => {
    const num = parseInt(hex.slice(1), 16);
    let r = (num >> 16) + percent;
    let g = ((num >> 8) & 0x00ff) + percent;
    let b = (num & 0x0000ff) + percent;
    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    b = Math.min(255, Math.max(0, b));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  };

  return adjustHex(baseColor, shadeOffset);
}

// Search endpoint
app.post('/search', (req, res) => {
  const { query, jurisdiction, practiceArea, documentType } = req.body;

  let rawData;
  try {
    rawData = fs.readFileSync(dataPath, 'utf-8');
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read data file' });
  }

  let cases = JSON.parse(rawData);
  if (!Array.isArray(cases)) cases = [cases];

  let results = cases.filter(c => {
    const caseMatch =
      (!jurisdiction || jurisdiction === 'All Jurisdictions' || c.case.jurisdiction === jurisdiction) &&
      (!documentType || documentType === 'All Document Types' || c.case.document_type === documentType) &&
      (!practiceArea || practiceArea === 'All Practice Areas' || c.case.practice_area.includes(practiceArea));

    if (!caseMatch) return false;

    if (!query) return true;
    const qLower = query.toLowerCase();
    return c.actionable_conduct.some(ac => ac.toLowerCase().includes(qLower));
  });

  // Compute similarity and apply color coding
  results = results.map(c => {
    const similarity = c.actionable_conduct.map(ac => {
      if (!query) return 0;
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      let count = 0;
      words.forEach(w => { if (ac.toLowerCase().includes(w)) count++; });
      return Math.round((count / words.length) * 100);
    });

    // Apply color coding per circumstance
    c.scenarios.forEach(scenario => {
      Object.entries(scenario.circumstances).forEach(([key, val]) => {
        if (typeof val === 'object') {
          val.color = getColor(val['fact-point'], val['law-point']);
        }
      });
    });

    c.similarity = similarity;
    return c;
  });

  res.json(results);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
