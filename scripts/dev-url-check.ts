import { checkUrlLive } from '../src/medical/nlm';

const candidates = [
  'https://medlineplus.gov/lab-tests/complete-blood-count/',
  'https://medlineplus.gov/lab-tests/hemoglobin/',
  'https://medlineplus.gov/lab-tests/white-blood-cell-count/',
  'https://medlineplus.gov/lab-tests/platelet-count/',
  'https://medlineplus.gov/lab-tests/a1c-test/',
  'https://medlineplus.gov/lab-tests/glucose/',
  'https://medlineplus.gov/lab-tests/cholesterol-levels/',
  'https://medlineplus.gov/lab-tests/liver-function-tests/',
  'https://medlineplus.gov/lab-tests/kidney-function-tests/',
  'https://medlineplus.gov/lab-tests/thyroid-stimulating-hormone-tsh-test/',
  'https://medlineplus.gov/lab-tests/erythrocyte-sedimentation-rate-esr/',
  'https://medlineplus.gov/lab-tests/iron/',
  'https://medlineplus.gov/bloodcounttests.html',
  'https://medlineplus.gov/flu.html',
  'https://medlineplus.gov/influenza.html',
  'https://medlineplus.gov/sweating.html',
  'https://medlineplus.gov/ency/article/000139.htm',
  'https://medlineplus.gov/ency/article/000016.htm',
  'https://medlineplus.gov/emergency.html',
  'https://medlineplus.gov/firstaid.html',
  'https://medlineplus.gov/breathingproblems.html',
  'https://medlineplus.gov/breathingproblems.html#emergency',
  'https://medlineplus.gov/chestpain.html',
  'https://medlineplus.gov/heartattack.html',
  'https://medlineplus.gov/stroke.html',
  'https://medlineplus.gov/seizures.html',
  'https://medlineplus.gov/anaphylaxis.html',
  'https://medlineplus.gov/meningitis.html',
  'https://medlineplus.gov/heatstroke.html',
  'https://medlineplus.gov/heatillness.html',
  'https://medlineplus.gov/animalbites.html',
  'https://medlineplus.gov/dizzinessandvertigo.html',
  'https://medlineplus.gov/fatigue.html',
  'https://medlineplus.gov/arrhythmia.html',
  'https://medlineplus.gov/nauseaandvomiting.html',
  'https://medlineplus.gov/jointdisorders.html',
  'https://medlineplus.gov/rashes.html',
  'https://medlineplus.gov/bodyweight.html',
  'https://medlineplus.gov/plateletdisorders.html',
  'https://medlineplus.gov/blooddisorders.html',
  'https://medlineplus.gov/anemia.html',
  'https://medlineplus.gov/thrombocytopenia.html',
];

const out = await Promise.all(
  candidates.map(async (url) => {
    const r = await checkUrlLive(url, 25000);
    return `${r.ok ? 'OK  ' : 'FAIL'} ${String(r.status ?? '-').padStart(3)} ${r.error ? `(${r.error}) ` : ''}${url}`;
  }),
);
out.forEach((l) => console.log(l));
