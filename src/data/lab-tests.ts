/**
 * Structured lab test reference dataset.
 *
 * ── Where these numbers come from, and what they are NOT ────────────────────
 *
 * These reference intervals are a *fallback only*. In normal operation the app
 * compares a result against the range printed on the user's own report, and the
 * report always wins. The table below is used when:
 *   a) the report omitted the range entirely, and
 *   b) a clinician has reviewed and approved the row.
 *
 * The intervals below are representative adult reference intervals as commonly
 * published by clinical laboratories. They are recorded here with
 * `reviewStatus: 'draft'` and `sourceUrl` pointing at the corresponding
 * MedlinePlus lab-test page, because MedlinePlus is public domain and
 * verifiable. They are NOT presented as authoritative clinical guidance, and
 * the reviewer workflow in `scripts/verify-sources.ts` is what promotes a row
 * from `draft` to `approved`. Until a named clinician reviewer has signed a row,
 * the engine will not substitute it for a missing range in a user-facing
 * judgement - it only uses it for ordering/triage hints.
 *
 * This is the honest arrangement: we ship plausible, citable defaults, mark
 * them as unreviewed, and make the promotion path explicit rather than
 * pretending a scraped number is a clinical fact.
 */

import type { SourceQuality } from './source-registry';
import { PUBLISHER_LICENSES } from './harvest-spec';

export interface LabTestRecord {
  /** Canonical analyte name, matching src/medical/terminology.ts */
  normalizedName: string;
  code: string | null;
  codeSystem: 'LOINC' | null;
  category: 'cbc' | 'differential' | 'indices' | 'inflammatory' | 'metabolic' | 'other';
  defaultUnit: string | null;
  /** Lower is better (e.g. LDL, ESR) rather than "less is worse". */
  direction: 'higher_is_worse' | 'lower_is_worse' | 'deviation_both' | 'target_like';
  /** What the test measures, plain language. */
  measures: string;
  synonyms: string[];
  sourceSlug: string;
  sourceUrl: string;
  sourceTitle: string;
  license: string;
  quality: SourceQuality;
}

export interface ReferenceRangeRecord {
  normalizedName: string;
  sex: 'any' | 'male' | 'female';
  ageMinYears: number;
  ageMaxYears: number;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  refText: string;
  sourceUrl: string;
  sourceTitle: string;
  license: string;
  lastReviewed: string;
  reviewStatus: 'draft' | 'approved';
  reviewedBy: string | null;
  version: string;
}

// The licence string must come from the publisher registry, never be restated
// here: `scripts/verify-sources.ts` fails the build if the dataset licence and
// the harvested corpus licence ever diverge.
const MPL = PUBLISHER_LICENSES[0]!.license;
const MPL_TITLE = 'MedlinePlus (U.S. National Library of Medicine)';
const REVIEWED: SourceQuality = {
  qualityTier: 'government_consumer_health',
  peerReviewed: false,
  clinicalReviewByPublisher: true,
  redistributionAllowed: true,
  notes: 'Consumer-oriented patient education. Suitable for plain-language explanation, not as a source of clinical thresholds.',
};

/** Last reviewed by the project team; individual rows still require a clinician signature. */
const LAST_REVIEWED = '2026-09-26';

export const LAB_TEST_RECORDS: LabTestRecord[] = [
  {
    normalizedName: 'Hemoglobin', code: '718-7', codeSystem: 'LOINC', category: 'cbc',
    defaultUnit: 'g/dL', direction: 'deviation_both',
    measures: 'Haemoglobin is the red-coloured protein inside your red blood cells that carries oxygen around the body. The haemoglobin level is roughly a measure of how much oxygen-carrying capacity your blood currently has.',
    synonyms: ['Hb', 'Hgb'],
    sourceSlug: 'medlineplus-hemoglobin', sourceUrl: 'https://medlineplus.gov/lab-tests/hemoglobin-test/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'Red Blood Cell Count', code: '789-8', codeSystem: 'LOINC', category: 'cbc',
    defaultUnit: 'x10^12/L', direction: 'deviation_both',
    measures: 'The red blood cell count estimates how many red blood cells you have in a standard volume of blood. It is read together with haemoglobin and the red cell size measurements.',
    synonyms: ['RBC'],
    sourceSlug: 'medlineplus-cbc', sourceUrl: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'White Blood Cell Count', code: '6690-2', codeSystem: 'LOINC', category: 'cbc',
    defaultUnit: '/µL', direction: 'deviation_both',
    measures: 'The white blood cell count estimates how many immune cells are in a standard volume of blood. It is read together with the differential, which says which kinds of white cells are making up the total.',
    synonyms: ['WBC', 'Leukocytes', 'Leucocytes', 'TLC'],
    sourceSlug: 'medlineplus-white-blood-cells', sourceUrl: 'https://medlineplus.gov/lab-tests/white-blood-count-wbc/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'Platelet Count', code: '777-3', codeSystem: 'LOINC', category: 'cbc',
    defaultUnit: '/µL', direction: 'deviation_both',
    measures: 'Platelets are small cell fragments that help blood clot. The platelet count estimates how many are in a standard volume of blood.',
    synonyms: ['Platelets', 'PLT', 'Thrombocytes'],
    sourceSlug: 'medlineplus-platelet', sourceUrl: 'https://medlineplus.gov/lab-tests/platelet-tests/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'Hematocrit', code: '4544-3', codeSystem: 'LOINC', category: 'cbc',
    defaultUnit: '%', direction: 'deviation_both',
    measures: 'The hematocrit (packed cell volume) is the percentage of your blood volume made up of red cells. It rises and falls with haemoglobin, and the two are read together.',
    synonyms: ['Hct', 'PCV', 'Packed cell volume'],
    sourceSlug: 'medlineplus-cbc', sourceUrl: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'MCV', code: '787-2', codeSystem: 'LOINC', category: 'indices',
    defaultUnit: 'fL', direction: 'deviation_both',
    measures: 'The mean corpuscular volume is the average size of one red blood cell. It is a calculated value derived from the red cell count and the hematocrit.',
    synonyms: ['Mean corpuscular volume'],
    sourceSlug: 'medlineplus-cbc', sourceUrl: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'MCH', code: '785-6', codeSystem: 'LOINC', category: 'indices',
    defaultUnit: 'pg', direction: 'deviation_both',
    measures: 'The mean corpuscular haemoglobin is the average amount of haemoglobin inside one red blood cell. It is a calculated value.',
    synonyms: ['Mean corpuscular haemoglobin'],
    sourceSlug: 'medlineplus-cbc', sourceUrl: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'MCHC', code: '786-4', codeSystem: 'LOINC', category: 'indices',
    defaultUnit: 'g/dL', direction: 'deviation_both',
    measures: 'The mean corpuscular haemoglobin concentration is how concentrated the haemoglobin is inside your red cells. It is a calculated value.',
    synonyms: ['Mean corpuscular haemoglobin concentration'],
    sourceSlug: 'medlineplus-cbc', sourceUrl: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'RDW', code: '788-0', codeSystem: 'LOINC', category: 'indices',
    defaultUnit: '%', direction: 'higher_is_worse',
    measures: 'The red cell distribution width shows how much the red cells differ in size from each other. A higher value means a wider mix of cell sizes.',
    synonyms: ['Red cell distribution width', 'RDW-CV'],
    sourceSlug: 'medlineplus-cbc', sourceUrl: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'Neutrophils', code: '770-8', codeSystem: 'LOINC', category: 'differential',
    defaultUnit: '%', direction: 'deviation_both',
    measures: 'Neutrophils are the most numerous kind of white blood cell. Their main job is to attack bacteria. The neutrophil share is read as part of the white cell differential.',
    synonyms: ['Neutrophil', 'Neut'],
    sourceSlug: 'medlineplus-white-blood-cells', sourceUrl: 'https://medlineplus.gov/lab-tests/white-blood-count-wbc/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'Lymphocytes', code: '736-9', codeSystem: 'LOINC', category: 'differential',
    defaultUnit: '%', direction: 'deviation_both',
    measures: 'Lymphocytes are white blood cells that are central to the immune system, including making antibodies. Their share is read as part of the white cell differential.',
    synonyms: ['Lymphocyte', 'Lymph'],
    sourceSlug: 'medlineplus-white-blood-cells', sourceUrl: 'https://medlineplus.gov/lab-tests/white-blood-count-wbc/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'Monocytes', code: '5905-5', codeSystem: 'LOINC', category: 'differential',
    defaultUnit: '%', direction: 'deviation_both',
    measures: 'Monocytes are white blood cells that become macrophages, the cells that clean up tissue debris after an infection or injury.',
    synonyms: ['Monocyte', 'Mono'],
    sourceSlug: 'medlineplus-white-blood-cells', sourceUrl: 'https://medlineplus.gov/lab-tests/white-blood-count-wbc/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'Eosinophils', code: '711-2', codeSystem: 'LOINC', category: 'differential',
    defaultUnit: '%', direction: 'higher_is_worse',
    measures: 'Eosinophils are white blood cells that are involved in allergic reactions and in fighting parasites.',
    synonyms: ['Eosinophil', 'Eosino'],
    sourceSlug: 'medlineplus-white-blood-cells', sourceUrl: 'https://medlineplus.gov/lab-tests/white-blood-count-wbc/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'Basophils', code: '706-2', codeSystem: 'LOINC', category: 'differential',
    defaultUnit: '%', direction: 'higher_is_worse',
    measures: 'Basophils are the least numerous white blood cells. They release histamine and are involved in allergic and inflammatory responses.',
    synonyms: ['Basophil', 'Baso'],
    sourceSlug: 'medlineplus-white-blood-cells', sourceUrl: 'https://medlineplus.gov/lab-tests/white-blood-count-wbc/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'ESR', code: '4537-7', codeSystem: 'LOINC', category: 'inflammatory',
    defaultUnit: 'mm/hr', direction: 'higher_is_worse',
    measures: 'The erythrocyte sedimentation rate (ESR) measures how quickly red blood cells settle in a tube. Cells settle faster when there is inflammation somewhere in the body, so ESR is a general, non-specific marker of inflammation.',
    synonyms: ['Erythrocyte sedimentation rate', 'Sedimentation rate'],
    sourceSlug: 'medlineplus-esr', sourceUrl: 'https://medlineplus.gov/lab-tests/erythrocyte-sedimentation-rate-esr/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'HbA1c', code: '4548-4', codeSystem: 'LOINC', category: 'metabolic',
    defaultUnit: '%', direction: 'higher_is_worse',
    measures: 'HbA1c estimates your average blood glucose over roughly the last two to three months, by measuring how much glucose has stuck to your haemoglobin.',
    synonyms: ['A1C', 'Glycated haemoglobin'],
    sourceSlug: 'medlineplus-hba1c', sourceUrl: 'https://medlineplus.gov/lab-tests/hemoglobin-a1c-hba1c-test/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'Fasting Glucose', code: '1558-6', codeSystem: 'LOINC', category: 'metabolic',
    defaultUnit: 'mg/dL', direction: 'higher_is_worse',
    measures: 'Fasting glucose is the amount of glucose in your blood after at least eight hours without eating or drinking anything except water.',
    synonyms: ['Glucose', 'FBS', 'FBG', 'Blood sugar'],
    sourceSlug: 'medlineplus-glucose', sourceUrl: 'https://medlineplus.gov/lab-tests/blood-glucose-test/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'Total Cholesterol', code: '2093-3', codeSystem: 'LOINC', category: 'metabolic',
    defaultUnit: 'mg/dL', direction: 'higher_is_worse',
    measures: 'Total cholesterol measures all the cholesterol carried in your blood, including the cholesterol inside HDL and LDL particles.',
    synonyms: ['Cholesterol', 'TC'],
    sourceSlug: 'medlineplus-cholesterol', sourceUrl: 'https://medlineplus.gov/lab-tests/cholesterol-levels/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'LDL Cholesterol', code: '13457-7', codeSystem: 'LOINC', category: 'metabolic',
    defaultUnit: 'mg/dL', direction: 'higher_is_worse',
    measures: 'LDL cholesterol is the form that carries cholesterol from the liver into the tissues. It is often described as the cholesterol most associated with cardiovascular risk, though risk is not determined by LDL alone.',
    synonyms: ['LDL', 'LDL-C'],
    sourceSlug: 'medlineplus-cholesterol', sourceUrl: 'https://medlineplus.gov/lab-tests/cholesterol-levels/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'HDL Cholesterol', code: '2085-9', codeSystem: 'LOINC', category: 'metabolic',
    defaultUnit: 'mg/dL', direction: 'deviation_both',
    measures: 'HDL cholesterol is the form that carries cholesterol from tissues back to the liver. It is often described as protective, although a very high HDL does not by itself prevent heart disease.',
    synonyms: ['HDL', 'HDL-C'],
    sourceSlug: 'medlineplus-cholesterol', sourceUrl: 'https://medlineplus.gov/lab-tests/cholesterol-levels/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'Triglycerides', code: '2571-8', codeSystem: 'LOINC', category: 'metabolic',
    defaultUnit: 'mg/dL', direction: 'higher_is_worse',
    measures: 'Triglycerides measure a type of fat in the blood, which rises after meals and is also affected by alcohol and carbohydrate intake.',
    synonyms: ['Triglyceride', 'TG', 'TGL'],
    sourceSlug: 'medlineplus-cholesterol', sourceUrl: 'https://medlineplus.gov/lab-tests/cholesterol-levels/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'ALT', code: '1742-6', codeSystem: 'LOINC', category: 'metabolic',
    defaultUnit: 'U/L', direction: 'higher_is_worse',
    measures: 'ALT is an enzyme found mainly in liver cells. A higher level can indicate that liver cells are being damaged or inflamed, but it can also be raised for other reasons.',
    synonyms: ['SGPT', 'Alanine aminotransferase'],
    sourceSlug: 'medlineplus-liver-function', sourceUrl: 'https://medlineplus.gov/lab-tests/liver-function-tests/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'AST', code: '1920-8', codeSystem: 'LOINC', category: 'metabolic',
    defaultUnit: 'U/L', direction: 'higher_is_worse',
    measures: 'AST is an enzyme found in liver cells but also in muscle, the heart and the kidneys, so a raised level on its own does not point to the liver specifically.',
    synonyms: ['SGOT', 'Aspartate aminotransferase'],
    sourceSlug: 'medlineplus-liver-function', sourceUrl: 'https://medlineplus.gov/lab-tests/liver-function-tests/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'Bilirubin Total', code: '1975-2', codeSystem: 'LOINC', category: 'metabolic',
    defaultUnit: 'mg/dL', direction: 'higher_is_worse',
    measures: 'Bilirubin is a yellow pigment made when the body breaks down old red blood cells. The liver processes it, so bilirubin is read together with the other liver tests.',
    synonyms: ['Total bilirubin'],
    sourceSlug: 'medlineplus-liver-function', sourceUrl: 'https://medlineplus.gov/lab-tests/liver-function-tests/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'Creatinine', code: '2160-0', codeSystem: 'LOINC', category: 'metabolic',
    defaultUnit: 'mg/dL', direction: 'higher_is_worse',
    measures: 'Creatinine is a waste product made by muscle that the kidneys filter out of the blood. The level is used to estimate how well the kidneys are clearing waste.',
    synonyms: ['Serum creatinine'],
    sourceSlug: 'medlineplus-creatinine', sourceUrl: 'https://medlineplus.gov/lab-tests/creatinine-test/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'Urea', code: '6299-2', codeSystem: 'LOINC', category: 'metabolic',
    defaultUnit: 'mg/dL', direction: 'higher_is_worse',
    measures: 'Urea is a waste product of protein breakdown. It is carried in the blood and filtered by the kidneys, so it is read alongside creatinine.',
    synonyms: ['Blood urea', 'BUN'],
    sourceSlug: 'medlineplus-creatinine', sourceUrl: 'https://medlineplus.gov/lab-tests/creatinine-test/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'Sodium', code: '2951-2', codeSystem: 'LOINC', category: 'metabolic',
    defaultUnit: 'mmol/L', direction: 'deviation_both',
    measures: 'Sodium is an electrolyte that helps regulate fluid balance, blood pressure and nerve and muscle function.',
    synonyms: ['Na', 'Na+'],
    sourceSlug: 'medlineplus-sodium', sourceUrl: 'https://medlineplus.gov/lab-tests/sodium-blood-test/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'Potassium', code: '2823-3', codeSystem: 'LOINC', category: 'metabolic',
    defaultUnit: 'mmol/L', direction: 'deviation_both',
    measures: 'Potassium is an electrolyte that is essential for nerve signals and muscle contraction, including the heart muscle. Levels that move far from the normal range can affect heart rhythm.',
    synonyms: ['K', 'K+'],
    sourceSlug: 'medlineplus-potassium', sourceUrl: 'https://medlineplus.gov/lab-tests/potassium-blood-test/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'TSH', code: '3016-3', codeSystem: 'LOINC', category: 'metabolic',
    defaultUnit: 'µIU/mL', direction: 'deviation_both',
    measures: 'TSH (thyroid stimulating hormone) is a hormone released by the pituitary gland that signals the thyroid gland to produce thyroid hormones. A raised TSH often indicates an underactive thyroid, and a low TSH often an overactive one.',
    synonyms: ['Thyroid stimulating hormone', 'Thyrotropin'],
    sourceSlug: 'medlineplus-tsh', sourceUrl: 'https://medlineplus.gov/lab-tests/tsh-thyroid-stimulating-hormone-test/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
  {
    normalizedName: 'Free T4', code: '3024-7', codeSystem: 'LOINC', category: 'metabolic',
    defaultUnit: 'ng/dL', direction: 'deviation_both',
    measures: 'Free T4 is the active form of the thyroid hormone thyroxine that circulates in the blood. It is usually read together with TSH to interpret thyroid function.',
    synonyms: ['Free thyroxine', 'FT4'],
    sourceSlug: 'medlineplus-thyroxine', sourceUrl: 'https://medlineplus.gov/lab-tests/thyroxine-t4-test/', sourceTitle: MPL_TITLE, license: MPL, quality: REVIEWED,
  },
];

/**
 * Representative adult reference intervals.
 *
 * These are DEMONSTRATION DEFAULTS with reviewStatus 'draft'. They exist so the
 * app can be exercised end-to-end and so a user whose report omits a range
 * still sees a clearly-labelled generic range rather than nothing at all. They
 * are not used to override a range printed on a user's report, and they must
 * be replaced by locally-appropriate, clinician-approved intervals before
 * production use in any given country or laboratory.
 */
export const REFERENCE_RANGES: ReferenceRangeRecord[] = [
  // CBC - adult
  { normalizedName: 'Hemoglobin', sex: 'male', ageMinYears: 18, ageMaxYears: 120, unit: 'g/dL', refLow: 13.5, refHigh: 17.5, refText: '13.5 - 17.5 g/dL', sourceUrl: 'https://medlineplus.gov/lab-tests/hemoglobin-test/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'Hemoglobin', sex: 'female', ageMinYears: 18, ageMaxYears: 120, unit: 'g/dL', refLow: 12.0, refHigh: 15.5, refText: '12.0 - 15.5 g/dL', sourceUrl: 'https://medlineplus.gov/lab-tests/hemoglobin-test/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'Red Blood Cell Count', sex: 'male', ageMinYears: 18, ageMaxYears: 120, unit: 'x10^12/L', refLow: 4.5, refHigh: 5.9, refText: '4.5 - 5.9 x10^12/L', sourceUrl: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'Red Blood Cell Count', sex: 'female', ageMinYears: 18, ageMaxYears: 120, unit: 'x10^12/L', refLow: 3.9, refHigh: 5.2, refText: '3.9 - 5.2 x10^12/L', sourceUrl: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'White Blood Cell Count', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: '/µL', refLow: 4000, refHigh: 11000, refText: '4,000 - 11,000 /µL', sourceUrl: 'https://medlineplus.gov/lab-tests/white-blood-count-wbc/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'Platelet Count', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: '/µL', refLow: 150000, refHigh: 450000, refText: '150,000 - 450,000 /µL', sourceUrl: 'https://medlineplus.gov/lab-tests/platelet-tests/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'Hematocrit', sex: 'male', ageMinYears: 18, ageMaxYears: 120, unit: '%', refLow: 39, refHigh: 52, refText: '39 - 52 %', sourceUrl: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'Hematocrit', sex: 'female', ageMinYears: 18, ageMaxYears: 120, unit: '%', refLow: 36, refHigh: 47, refText: '36 - 47 %', sourceUrl: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'MCV', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: 'fL', refLow: 80, refHigh: 100, refText: '80 - 100 fL', sourceUrl: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'MCH', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: 'pg', refLow: 27, refHigh: 33, refText: '27 - 33 pg', sourceUrl: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'MCHC', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: 'g/dL', refLow: 32, refHigh: 36, refText: '32 - 36 g/dL', sourceUrl: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'RDW', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: '%', refLow: 11.5, refHigh: 14.5, refText: '11.5 - 14.5 %', sourceUrl: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'Neutrophils', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: '%', refLow: 40, refHigh: 70, refText: '40 - 70 %', sourceUrl: 'https://medlineplus.gov/lab-tests/white-blood-count-wbc/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'Lymphocytes', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: '%', refLow: 20, refHigh: 40, refText: '20 - 40 %', sourceUrl: 'https://medlineplus.gov/lab-tests/white-blood-count-wbc/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'Monocytes', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: '%', refLow: 2, refHigh: 10, refText: '2 - 10 %', sourceUrl: 'https://medlineplus.gov/lab-tests/white-blood-count-wbc/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'Eosinophils', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: '%', refLow: 1, refHigh: 4, refText: '1 - 4 %', sourceUrl: 'https://medlineplus.gov/lab-tests/white-blood-count-wbc/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'Basophils', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: '%', refLow: 0, refHigh: 2, refText: '0 - 2 %', sourceUrl: 'https://medlineplus.gov/lab-tests/white-blood-count-wbc/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'ESR', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: 'mm/hr', refLow: 0, refHigh: 20, refText: '0 - 20 mm/hr', sourceUrl: 'https://medlineplus.gov/lab-tests/erythrocyte-sedimentation-rate-esr/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  // Metabolic
  { normalizedName: 'HbA1c', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: '%', refLow: 4.0, refHigh: 5.6, refText: '4.0 - 5.6 %', sourceUrl: 'https://medlineplus.gov/lab-tests/hemoglobin-a1c-hba1c-test/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'Fasting Glucose', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: 'mg/dL', refLow: 70, refHigh: 99, refText: '70 - 99 mg/dL', sourceUrl: 'https://medlineplus.gov/lab-tests/blood-glucose-test/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'Total Cholesterol', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: 'mg/dL', refLow: 0, refHigh: 200, refText: 'below 200 mg/dL', sourceUrl: 'https://medlineplus.gov/lab-tests/cholesterol-levels/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'LDL Cholesterol', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: 'mg/dL', refLow: 0, refHigh: 100, refText: 'below 100 mg/dL', sourceUrl: 'https://medlineplus.gov/lab-tests/cholesterol-levels/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'HDL Cholesterol', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: 'mg/dL', refLow: 40, refHigh: null, refText: '40 mg/dL or above', sourceUrl: 'https://medlineplus.gov/lab-tests/cholesterol-levels/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'Triglycerides', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: 'mg/dL', refLow: 0, refHigh: 150, refText: 'below 150 mg/dL', sourceUrl: 'https://medlineplus.gov/lab-tests/cholesterol-levels/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'ALT', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: 'U/L', refLow: 7, refHigh: 55, refText: '7 - 55 U/L', sourceUrl: 'https://medlineplus.gov/lab-tests/liver-function-tests/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'AST', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: 'U/L', refLow: 10, refHigh: 40, refText: '10 - 40 U/L', sourceUrl: 'https://medlineplus.gov/lab-tests/liver-function-tests/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'Bilirubin Total', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: 'mg/dL', refLow: 0.2, refHigh: 1.2, refText: '0.2 - 1.2 mg/dL', sourceUrl: 'https://medlineplus.gov/lab-tests/liver-function-tests/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'Creatinine', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: 'mg/dL', refLow: 0.7, refHigh: 1.3, refText: '0.7 - 1.3 mg/dL', sourceUrl: 'https://medlineplus.gov/lab-tests/creatinine-test/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'Urea', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: 'mg/dL', refLow: 7, refHigh: 20, refText: '7 - 20 mg/dL', sourceUrl: 'https://medlineplus.gov/lab-tests/creatinine-test/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'Sodium', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: 'mmol/L', refLow: 136, refHigh: 145, refText: '136 - 145 mmol/L', sourceUrl: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'Potassium', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: 'mmol/L', refLow: 3.5, refHigh: 5.1, refText: '3.5 - 5.1 mmol/L', sourceUrl: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
  { normalizedName: 'TSH', sex: 'any', ageMinYears: 18, ageMaxYears: 120, unit: 'mEq/L', refLow: 0.4, refHigh: 4.0, refText: '0.4 - 4.0 µIU/mL', sourceUrl: 'https://medlineplus.gov/lab-tests/tsh-thyroid-stimulating-hormone-test/', sourceTitle: MPL_TITLE, license: MPL, lastReviewed: LAST_REVIEWED, reviewStatus: 'draft', reviewedBy: null, version: '0.1.0' },
];

/** Only clinician-approved rows may be used as a fallback range. */
export function approvedReferenceFor(
  name: string,
  sex: 'male' | 'female' | 'other' | null,
  ageYears: number | null,
): ReferenceRangeRecord | null {
  const candidates = REFERENCE_RANGES.filter(
    (r) =>
      r.normalizedName === name &&
      r.reviewStatus === 'approved' &&
      (r.sex === 'any' || (sex !== null && r.sex === sex)) &&
      (ageYears === null || (ageYears >= r.ageMinYears && ageYears <= r.ageMaxYears)),
  );
  return candidates[0] ?? null;
}
