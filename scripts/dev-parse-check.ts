import { parseLabReport } from '../src/medical/report-parser';

const SAMPLE = `SUNRISE DIAGNOSTICS PVT LTD
No. 42, MG Road, Bengaluru - 560001
Phone: 080-4123-4567

Patient Name: JOHN DOE              Ref By: Dr. A. Kumar
Age/Sex: 34 / Male                 Sample Collected: 26/09/2026 10:35 AM
Report Date: 26-09-2026

COMPLETE BLOOD COUNT (CBC)
Test Name                Result        Unit        Reference Range
Hemoglobin               10.2          g/dL        13.0 - 17.0   L
RBC Count                4.10          x10^12/L    4.50 - 5.90    L
WBC Count                7,200         /uL         4,000-11,000
Platelets                142,000       /uL         150,000-410,000 L
Hematocrit (PCV)         33.1          %           40 - 50        L
MCV                      80.7          fL          83 - 101        L
MCH                      24.9          pg          27 - 32         L
MCHC                     30.8          g/dL        31.5 - 34.5
RDW-CV                   14.6          %           11.6 - 14.4
Neutrophils              62            %           40 - 70
Lymphocytes              28            %           20 - 40
Monocytes                6             %           2 - 10
Eosinophils              4             %           1 - 6
Basophils                1             %           0 - 1
ESR                      24            mm/hr       0 - 20         H

-- End of report --`;

const parsed = parseLabReport(SAMPLE);
console.log('=== HEADER ===');
console.log(JSON.stringify(parsed.header, null, 2));
console.log('\n=== RESULTS ===');
for (const r of parsed.results) {
  console.log(
    `${r.normalizedName.padEnd(26)} ${String(r.value).padStart(9)} ${(r.unit ?? '-').padEnd(10)} ref[${r.referenceLow}, ${r.referenceHigh}] -> ${r.status}${r.reportedFlag ? ` (flag ${r.reportedFlag})` : ''}`,
  );
}
console.log('\n=== UNPARSED ===');
for (const u of parsed.unparsed) console.log('-', u.line, '::', u.reason);
console.log('\ncount:', parsed.results.length);
