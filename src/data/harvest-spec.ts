/**
 * Health-topic harvest spec.
 *
 * This is the only place that decides *what* we ingest from MedlinePlus. Keeping
 * it as data (not code) means a clinical reviewer can audit and change the
 * harvest list without touching application logic.
 *
 * ── Licensing ───────────────────────────────────────────────────────────────
 * MedlinePlus is produced by the U.S. National Library of Medicine, a federal
 * agency; its content is a work of the U.S. government and is in the public
 * domain. We store publisher, URL, licence and review date for every ingested
 * page so every explanation we emit is traceable.
 *
 * ── How these URLs were obtained ────────────────────────────────────────────
 * Every `expectedUrl` below was resolved against the live NLM web service and
 * then confirmed to return HTTP 200 by `npm run db:verify`. Nothing here was
 * written from memory. When a URL moves, `harvest-corpus.ts` fails loudly
 * instead of silently citing a different page, and `resolve-harvest-spec.ts`
 * regenerates the list for review.
 */

export interface HarvestSpec {
  /** Stable key used in the database and in citations. */
  slug: string;
  /** Search term sent to the NLM web service. */
  query: string;
  /**
   * The MedlinePlus URL for this topic, verified live. Ingestion asserts that
   * the service still returns it, and that the returned document's title is
   * consistent with `titleKeywords`.
   */
  expectedUrl: string;
  /**
   * Words that must appear in the fetched page title. A mismatch means the
   * service re-ranked and we are looking at a different page, so the harvest is
   * rejected rather than stored under the wrong citation.
   */
  titleKeywords: string[];
  conceptName: string;
  category: 'lab_test' | 'symptom' | 'condition' | 'emergency' | 'general';
  /** How this concept is used by the product. */
  role: 'explains_test' | 'explains_symptom' | 'escalation_criteria' | 'self_care' | 'background';
  /** Search these too, to enrich the concept with related pages. */
  relatedQueries?: string[];
}

const KW = (...k: string[]) => k;

export const HARVEST_SPECS: HarvestSpec[] = [
  // ── Emergency / escalation criteria ───────────────────────────────────────
  { slug: 'medlineplus-emergency', query: 'emergency medical services', expectedUrl: 'https://medlineplus.gov/emergencymedicalservices.html', titleKeywords: KW('emergenc'), conceptName: 'When to get emergency care', category: 'emergency', role: 'escalation_criteria' },
  { slug: 'medlineplus-first-aid', query: 'first aid', expectedUrl: 'https://medlineplus.gov/firstaid.html', titleKeywords: KW('first aid'), conceptName: 'First aid', category: 'emergency', role: 'self_care' },
  { slug: 'medlineplus-chest-pain', query: 'chest pain', expectedUrl: 'https://medlineplus.gov/chestpain.html', titleKeywords: KW('chest pain'), conceptName: 'Chest pain', category: 'emergency', role: 'escalation_criteria' },
  { slug: 'medlineplus-breathing-problems', query: 'breathing problems', expectedUrl: 'https://medlineplus.gov/breathingproblems.html', titleKeywords: KW('breathing'), conceptName: 'Breathing problems', category: 'emergency', role: 'escalation_criteria' },
  { slug: 'medlineplus-seizures', query: 'seizures', expectedUrl: 'https://medlineplus.gov/seizures.html', titleKeywords: KW('seizure'), conceptName: 'Seizures', category: 'emergency', role: 'escalation_criteria' },
  { slug: 'medlineplus-meningitis', query: 'meningitis', expectedUrl: 'https://medlineplus.gov/meningitis.html', titleKeywords: KW('meningitis'), conceptName: 'Meningitis', category: 'emergency', role: 'escalation_criteria' },
  { slug: 'medlineplus-heat-illness', query: 'heat illness', expectedUrl: 'https://medlineplus.gov/heatillness.html', titleKeywords: KW('heat'), conceptName: 'Heat illness and heat stroke', category: 'emergency', role: 'escalation_criteria' },
  { slug: 'medlineplus-anaphylaxis', query: 'anaphylaxis', expectedUrl: 'https://medlineplus.gov/anaphylaxis.html', titleKeywords: KW('anaphylaxis'), conceptName: 'Anaphylaxis', category: 'emergency', role: 'escalation_criteria' },
  { slug: 'medlineplus-stroke', query: 'stroke', expectedUrl: 'https://medlineplus.gov/stroke.html', titleKeywords: KW('stroke'), conceptName: 'Stroke', category: 'emergency', role: 'escalation_criteria' },
  { slug: 'medlineplus-heart-attack', query: 'heart attack', expectedUrl: 'https://medlineplus.gov/heartattack.html', titleKeywords: KW('heart attack'), conceptName: 'Heart attack', category: 'emergency', role: 'escalation_criteria' },
  { slug: 'medlineplus-animal-bites', query: 'animal bites', expectedUrl: 'https://medlineplus.gov/animalbites.html', titleKeywords: KW('bite'), conceptName: 'Animal and snake bites', category: 'emergency', role: 'escalation_criteria' },
  { slug: 'medlineplus-poisoning', query: 'poisoning', expectedUrl: 'https://medlineplus.gov/poisoning.html', titleKeywords: KW('poison'), conceptName: 'Poisoning', category: 'emergency', role: 'escalation_criteria' },
  { slug: 'medlineplus-appendicitis', query: 'appendicitis', expectedUrl: 'https://medlineplus.gov/appendicitis.html', titleKeywords: KW('appendicitis'), conceptName: 'Appendicitis', category: 'emergency', role: 'escalation_criteria' },

  // ── Symptoms ──────────────────────────────────────────────────────────────
  { slug: 'medlineplus-cough', query: 'cough', expectedUrl: 'https://medlineplus.gov/cough.html', titleKeywords: KW('cough'), conceptName: 'Cough', category: 'symptom', role: 'explains_symptom', relatedQueries: ['acute bronchitis', 'whooping cough'] },
  { slug: 'medlineplus-fever', query: 'fever', expectedUrl: 'https://medlineplus.gov/fever.html', titleKeywords: KW('fever'), conceptName: 'Fever', category: 'symptom', role: 'explains_symptom' },
  { slug: 'medlineplus-headache', query: 'headache', expectedUrl: 'https://medlineplus.gov/headache.html', titleKeywords: KW('headache'), conceptName: 'Headache', category: 'symptom', role: 'explains_symptom' },
  { slug: 'medlineplus-abdominal-pain', query: 'abdominal pain', expectedUrl: 'https://medlineplus.gov/abdominalpain.html', titleKeywords: KW('abdominal'), conceptName: 'Abdominal pain', category: 'symptom', role: 'explains_symptom' },
  { slug: 'medlineplus-dizziness', query: 'dizziness', expectedUrl: 'https://medlineplus.gov/dizzinessandvertigo.html', titleKeywords: KW('dizz'), conceptName: 'Dizziness and vertigo', category: 'symptom', role: 'explains_symptom' },
  { slug: 'medlineplus-fatigue', query: 'fatigue', expectedUrl: 'https://medlineplus.gov/fatigue.html', titleKeywords: KW('fatigue'), conceptName: 'Fatigue', category: 'symptom', role: 'explains_symptom' },
  { slug: 'medlineplus-palpitations', query: 'arrhythmia', expectedUrl: 'https://medlineplus.gov/arrhythmia.html', titleKeywords: KW('arrhythmia'), conceptName: 'Palpitations and abnormal heart rhythms', category: 'symptom', role: 'explains_symptom' },
  { slug: 'medlineplus-nausea-vomiting', query: 'nausea and vomiting', expectedUrl: 'https://medlineplus.gov/nauseaandvomiting.html', titleKeywords: KW('nausea'), conceptName: 'Nausea and vomiting', category: 'symptom', role: 'explains_symptom' },
  { slug: 'medlineplus-diarrhea', query: 'diarrhea', expectedUrl: 'https://medlineplus.gov/diarrhea.html', titleKeywords: KW('diarrh'), conceptName: 'Diarrhoea', category: 'symptom', role: 'explains_symptom' },
  { slug: 'medlineplus-joint-pain', query: 'joint disorders', expectedUrl: 'https://medlineplus.gov/jointdisorders.html', titleKeywords: KW('joint'), conceptName: 'Joint pain and disorders', category: 'symptom', role: 'explains_symptom' },
  { slug: 'medlineplus-rash', query: 'rashes', expectedUrl: 'https://medlineplus.gov/rashes.html', titleKeywords: KW('rash'), conceptName: 'Rash', category: 'symptom', role: 'explains_symptom' },
  { slug: 'medlineplus-sore-throat', query: 'sore throat', expectedUrl: 'https://medlineplus.gov/sorethroat.html', titleKeywords: KW('sore throat'), conceptName: 'Sore throat', category: 'symptom', role: 'explains_symptom' },
  { slug: 'medlineplus-body-weight', query: 'body weight', expectedUrl: 'https://medlineplus.gov/bodyweight.html', titleKeywords: KW('weight'), conceptName: 'Body weight', category: 'general', role: 'background' },
  { slug: 'medlineplus-swollen-legs', query: 'edema', expectedUrl: 'https://medlineplus.gov/edema.html', titleKeywords: KW('edema', 'swelling', 'swollen'), conceptName: 'Swelling (oedema)', category: 'symptom', role: 'explains_symptom' },

  // ── Lab tests ─────────────────────────────────────────────────────────────
  { slug: 'medlineplus-cbc', query: 'complete blood count', expectedUrl: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/', titleKeywords: KW('complete blood count', 'blood count'), conceptName: 'Complete Blood Count (CBC)', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-hemoglobin', query: 'hemoglobin test', expectedUrl: 'https://medlineplus.gov/lab-tests/hemoglobin-test/', titleKeywords: KW('hemoglobin', 'haemoglobin'), conceptName: 'Hemoglobin', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-hematocrit', query: 'hematocrit test', expectedUrl: 'https://medlineplus.gov/lab-tests/hematocrit-test/', titleKeywords: KW('hematocrit', 'haematocrit'), conceptName: 'Hematocrit (PCV)', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-white-blood-cells', query: 'white blood count', expectedUrl: 'https://medlineplus.gov/lab-tests/white-blood-count-wbc/', titleKeywords: KW('white blood'), conceptName: 'White Blood Cell Count', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-platelet', query: 'platelet tests', expectedUrl: 'https://medlineplus.gov/lab-tests/platelet-tests/', titleKeywords: KW('platelet'), conceptName: 'Platelet count', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-rdw', query: 'RDW red cell distribution width', expectedUrl: 'https://medlineplus.gov/lab-tests/rdw-red-cell-distribution-width/', titleKeywords: KW('rdw', 'red cell distribution'), conceptName: 'RDW (red cell distribution width)', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-mcv', query: 'MCV mean corpuscular volume', expectedUrl: 'https://medlineplus.gov/lab-tests/mcv-mean-corpuscular-volume/', titleKeywords: KW('mcv', 'mean corpuscular'), conceptName: 'MCV (mean corpuscular volume)', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-blood-differential', query: 'blood differential', expectedUrl: 'https://medlineplus.gov/lab-tests/blood-differential/', titleKeywords: KW('differential'), conceptName: 'White cell differential', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-blood-smear', query: 'blood smear', expectedUrl: 'https://medlineplus.gov/lab-tests/blood-smear/', titleKeywords: KW('smear'), conceptName: 'Peripheral blood smear', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-esr', query: 'erythrocyte sedimentation rate', expectedUrl: 'https://medlineplus.gov/lab-tests/erythrocyte-sedimentation-rate-esr/', titleKeywords: KW('sedimentation', 'esr'), conceptName: 'Erythrocyte sedimentation rate (ESR)', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-hba1c', query: 'hemoglobin A1C', expectedUrl: 'https://medlineplus.gov/lab-tests/hemoglobin-a1c-hba1c-test/', titleKeywords: KW('a1c', 'glycated'), conceptName: 'HbA1c (A1C)', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-glucose', query: 'blood glucose test', expectedUrl: 'https://medlineplus.gov/lab-tests/blood-glucose-test/', titleKeywords: KW('glucose'), conceptName: 'Blood glucose', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-cholesterol', query: 'cholesterol levels', expectedUrl: 'https://medlineplus.gov/lab-tests/cholesterol-levels/', titleKeywords: KW('cholesterol'), conceptName: 'Cholesterol', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-triglycerides', query: 'triglycerides test', expectedUrl: 'https://medlineplus.gov/lab-tests/triglycerides-test/', titleKeywords: KW('triglyceride'), conceptName: 'Triglycerides', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-liver-function', query: 'liver function tests', expectedUrl: 'https://medlineplus.gov/lab-tests/liver-function-tests/', titleKeywords: KW('liver'), conceptName: 'Liver function tests', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-alt', query: 'ALT blood test', expectedUrl: 'https://medlineplus.gov/lab-tests/alt-blood-test/', titleKeywords: KW('alt', 'alanine'), conceptName: 'ALT', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-ast', query: 'AST test', expectedUrl: 'https://medlineplus.gov/lab-tests/ast-test/', titleKeywords: KW('ast', 'aspartate'), conceptName: 'AST', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-bilirubin', query: 'bilirubin blood test', expectedUrl: 'https://medlineplus.gov/lab-tests/bilirubin-blood-test/', titleKeywords: KW('bilirubin'), conceptName: 'Bilirubin', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-creatinine', query: 'creatinine test', expectedUrl: 'https://medlineplus.gov/lab-tests/creatinine-test/', titleKeywords: KW('creatinine'), conceptName: 'Creatinine', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-bun', query: 'BUN blood urea nitrogen', expectedUrl: 'https://medlineplus.gov/lab-tests/bun-blood-urea-nitrogen/', titleKeywords: KW('urea', 'bun'), conceptName: 'Blood urea nitrogen', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-tsh', query: 'TSH thyroid stimulating hormone', expectedUrl: 'https://medlineplus.gov/lab-tests/tsh-thyroid-stimulating-hormone-test/', titleKeywords: KW('tsh', 'thyroid'), conceptName: 'TSH', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-thyroxine', query: 'thyroxine T4 test', expectedUrl: 'https://medlineplus.gov/lab-tests/thyroxine-t4-test/', titleKeywords: KW('thyroxine', 't4'), conceptName: 'Thyroxine (T4)', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-iron', query: 'iron tests', expectedUrl: 'https://medlineplus.gov/lab-tests/iron-tests/', titleKeywords: KW('iron'), conceptName: 'Iron', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-vitamin-b', query: 'vitamin B test', expectedUrl: 'https://medlineplus.gov/lab-tests/vitamin-b-test/', titleKeywords: KW('vitamin b'), conceptName: 'Vitamin B', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-vitamin-d', query: 'vitamin D test', expectedUrl: 'https://medlineplus.gov/lab-tests/vitamin-d-test/', titleKeywords: KW('vitamin d'), conceptName: 'Vitamin D', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-electrolytes', query: 'electrolyte panel', expectedUrl: 'https://medlineplus.gov/lab-tests/electrolyte-panel/', titleKeywords: KW('electrolyte'), conceptName: 'Electrolyte panel', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-sodium', query: 'sodium blood test', expectedUrl: 'https://medlineplus.gov/lab-tests/sodium-blood-test/', titleKeywords: KW('sodium'), conceptName: 'Sodium', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-potassium', query: 'potassium blood test', expectedUrl: 'https://medlineplus.gov/lab-tests/potassium-blood-test/', titleKeywords: KW('potassium'), conceptName: 'Potassium', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-albumin', query: 'albumin blood test', expectedUrl: 'https://medlineplus.gov/lab-tests/albumin-blood-test/', titleKeywords: KW('albumin'), conceptName: 'Albumin', category: 'lab_test', role: 'explains_test' },
  { slug: 'medlineplus-crp', query: 'C-reactive protein', expectedUrl: 'https://medlineplus.gov/lab-tests/c-reactive-protein-crp-test/', titleKeywords: KW('c-reactive', 'crp'), conceptName: 'C-reactive protein (CRP)', category: 'lab_test', role: 'explains_test' },

  // ── Conditions (background, for "possible explanations" framing) ──────────
  { slug: 'medlineplus-anemia', query: 'anemia', expectedUrl: 'https://medlineplus.gov/anemia.html', titleKeywords: KW('anemia', 'anaemia'), conceptName: 'Anaemia', category: 'condition', role: 'background' },
  { slug: 'medlineplus-blood-disorders', query: 'blood disorders', expectedUrl: 'https://medlineplus.gov/blooddisorders.html', titleKeywords: KW('blood disorder'), conceptName: 'Blood disorders', category: 'condition', role: 'background' },
  { slug: 'medlineplus-platelet-disorders', query: 'platelet disorders', expectedUrl: 'https://medlineplus.gov/plateletdisorders.html', titleKeywords: KW('platelet'), conceptName: 'Platelet disorders', category: 'condition', role: 'background' },
  { slug: 'medlineplus-iron-deficiency', query: 'iron deficiency anemia', expectedUrl: 'https://medlineplus.gov/anemia.html', titleKeywords: KW('anemia', 'anemia'), conceptName: 'Iron deficiency anaemia', category: 'condition', role: 'background' },
  { slug: 'medlineplus-leukemia', query: 'leukemia', expectedUrl: 'https://medlineplus.gov/leukemia.html', titleKeywords: KW('leukemia', 'leukaemia'), conceptName: 'Leukaemia', category: 'condition', role: 'background' },
  { slug: 'medlineplus-asthma', query: 'asthma', expectedUrl: 'https://medlineplus.gov/asthma.html', titleKeywords: KW('asthma'), conceptName: 'Asthma', category: 'condition', role: 'background' },
  { slug: 'medlineplus-pneumonia', query: 'pneumonia', expectedUrl: 'https://medlineplus.gov/pneumonia.html', titleKeywords: KW('pneumonia'), conceptName: 'Pneumonia', category: 'condition', role: 'background' },
  { slug: 'medlineplus-bronchitis', query: 'acute bronchitis', expectedUrl: 'https://medlineplus.gov/acutebronchitis.html', titleKeywords: KW('bronchitis'), conceptName: 'Acute bronchitis', category: 'condition', role: 'background' },
  { slug: 'medlineplus-common-cold', query: 'common cold', expectedUrl: 'https://medlineplus.gov/commoncold.html', titleKeywords: KW('cold'), conceptName: 'Common cold', category: 'condition', role: 'background' },
  { slug: 'medlineplus-influenza', query: 'influenza', expectedUrl: 'https://medlineplus.gov/flu.html', titleKeywords: KW('flu', 'influenza'), conceptName: 'Influenza (flu)', category: 'condition', role: 'background' },
  { slug: 'medlineplus-covid', query: 'COVID-19', expectedUrl: 'https://medlineplus.gov/covid19coronavirusdisease2019.html', titleKeywords: KW('covid'), conceptName: 'COVID-19', category: 'condition', role: 'background' },
  { slug: 'medlineplus-tuberculosis', query: 'tuberculosis', expectedUrl: 'https://medlineplus.gov/tuberculosis.html', titleKeywords: KW('tuberculosis'), conceptName: 'Tuberculosis', category: 'condition', role: 'background' },
  { slug: 'medlineplus-urinary-tract-infection', query: 'urinary tract infections', expectedUrl: 'https://medlineplus.gov/urinarytractinfections.html', titleKeywords: KW('urinary'), conceptName: 'Urinary tract infection', category: 'condition', role: 'background' },
  { slug: 'medlineplus-blood-clots', query: 'blood clots', expectedUrl: 'https://medlineplus.gov/bloodclots.html', titleKeywords: KW('blood clot'), conceptName: 'Blood clots', category: 'condition', role: 'background' },
  { slug: 'medlineplus-dehydration', query: 'dehydration', expectedUrl: 'https://medlineplus.gov/dehydration.html', titleKeywords: KW('dehydration'), conceptName: 'Dehydration', category: 'condition', role: 'background' },
  { slug: 'medlineplus-hiv', query: 'HIV infection', expectedUrl: 'https://medlineplus.gov/hiv.html', titleKeywords: KW('hiv'), conceptName: 'HIV infection', category: 'condition', role: 'background' },
  { slug: 'medlineplus-diabetes', query: 'diabetes', expectedUrl: 'https://medlineplus.gov/diabetes.html', titleKeywords: KW('diabetes'), conceptName: 'Diabetes', category: 'condition', role: 'background' },
  { slug: 'medlineplus-hypertension', query: 'high blood pressure', expectedUrl: 'https://medlineplus.gov/highbloodpressure.html', titleKeywords: KW('blood pressure'), conceptName: 'High blood pressure', category: 'condition', role: 'background' },
];

/** Static licence record for the corpus host. One row per publisher. */
export const PUBLISHER_LICENSES = [
  {
    slug: 'medlineplus-nlm',
    publisher: 'U.S. National Library of Medicine (NLM), National Institutes of Health',
    license: 'Public domain (work of the U.S. federal government; 17 U.S.C. 105)',
    licensed: true,
    redistribution_allowed: true,
    authorityNote:
      'MedlinePlus health topics are written and medically reviewed by professionals at NLM and are a work of the U.S. federal government, placed in the public domain. Content is consumer-oriented and is intended for patient education, not for making clinical decisions.',
  },
] as const;

/** Title-guard: reject a harvest when the service re-ranked to a different page. */
export function titleMatches(spec: HarvestSpec, fetchedTitle: string): boolean {
  const t = fetchedTitle.toLowerCase();
  return spec.titleKeywords.some((k) => t.includes(k.toLowerCase()));
}
