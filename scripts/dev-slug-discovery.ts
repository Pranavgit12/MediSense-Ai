/** Dev-only: discover the live MedlinePlus /lab-tests/ slugs from the index page. */
async function main() {
  const r = await fetch('https://medlineplus.gov/lab-tests/', {
    headers: { 'user-agent': 'Mozilla/5.0 MediSense slug-discovery' },
  });
  const h = await r.text();
  console.log('status', r.status, 'len', h.length);
  const s = new Set<string>();
  for (const m of h.matchAll(/href=["']([^"']*\/lab-tests\/[a-z0-9-]+\/)["']/g)) {
    s.add(m[1]!.replace(/^https?:\/\/medlineplus\.gov/, ''));
  }
  console.log('found', s.size);
  const sorted = [...s].sort();
  const wanted = [
    'complete-blood', 'blood-count', 'hemoglobin', 'hematocrit', 'white-blood-cell',
    'platelet', 'rdw', 'mcv', 'sedimentation', 'a1c', 'glycated', 'glucose',
    'creatinine', 'urea', 'tsh', 'thyroid-stimulating', 'alanine', 'aspartate',
    'bilirubin', 'iron', 'b-12', 'b12', 'vitamin-d', 'electrolyte', 'sodium',
    'potassium', 'albumin', 'protein', 'mpv', 'neutrophil', 'lymphocyte',
    'monocyte', 'eosinophil', 'basophil', 'differential', 'cholesterol', 'hdl', 'ldl', 'triglyceride',
  ];
  console.log('--- matches ---');
  for (const w of wanted) {
    const hits = sorted.filter((x) => x.includes(w));
    if (hits.length) console.log(`${w.padEnd(26)} -> ${hits.join(' ')}`);
  }
  console.log('--- all ---');
  console.log(sorted.join('\n'));
}
main();
