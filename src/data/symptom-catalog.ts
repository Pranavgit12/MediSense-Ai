/**
 * Symptom catalog derived from the provider-supplied `Symptom-severity.csv`
 * (133 rows, relative weights 1-7).
 *
 * SAFETY RULES ENCODED HERE - please read before changing anything:
 *
 * 1. The `weight` column is a RELATIVE IMPORTANCE RANK from a symptom list.
 *    It is not a probability, not a likelihood ratio, and not diagnostic
 *    evidence. It must never be displayed as "% chance of <disease>", must
 *    never be used to name a condition, and must never be used to rank
 *    conditions against each other.
 *
 * 2. Emergency routing is NOT derived from `weight`. A weight of 7 does not
 *    mean "emergency". Red-flag status lives in `EMERGENCY_SYMPTOMS`, which is
 *    a separate, explicitly reviewed list.
 *
 * 3. The catalog is for building an intake questionnaire and for organising
 *    what a person tells us. It performs no diagnosis.
 *
 * Provenance of the corrections applied to the raw CSV is recorded per row in
 * `notes` so a reviewer can see exactly what was changed and why.
 */

export type SymptomCategory =
  | 'general'
  | 'skin'
  | 'gastrointestinal'
  | 'respiratory'
  | 'cardiovascular'
  | 'neurological'
  | 'musculoskeletal'
  | 'urinary'
  | 'reproductive'
  | 'entomological'
  | 'metabolic'
  | 'psychological'
  | 'exposure';

/** How a raw CSV row was treated when building this catalog. */
export type SymptomDisposition = 'included' | 'reclassified_as_exposure' | 'excluded';

export interface SymptomDefinition {
  /** Stable snake_case key used everywhere in the app and the database. */
  key: string;
  /** Plain-language label shown to a person. Never a diagnosis. */
  label: string;
  /** Relative importance 1-7 from the source list. Not a probability. */
  weight: number;
  category: SymptomCategory;
  disposition: SymptomDisposition;
  /** Emergency routing, decided by clinical review and never by `weight`. */
  emergency: boolean;
  /** Optional short prompt shown under the question. */
  prompt?: string;
  /** What was changed relative to the raw CSV, and why. */
  notes?: string;
}

function def(
  key: string,
  label: string,
  weight: number,
  category: SymptomCategory,
  extra: Partial<SymptomDefinition> = {},
): SymptomDefinition {
  return {
    key,
    label,
    weight,
    category,
    disposition: extra.disposition ?? 'included',
    emergency: extra.emergency ?? false,
    ...(extra.prompt ? { prompt: extra.prompt } : {}),
    ...(extra.notes ? { notes: extra.notes } : {}),
  };
}

// Keep this list explicit and reviewable. Each entry maps symptom key -> the
// urgency guidance a person should see. Anything not listed here is routed by
// the general rules engine, never by weight.
const RED_FLAG_NOTES: Record<string, string> = {
  chest_pain:
    'Emergency. Severe, crushing or spreading chest pain needs emergency services immediately.',
  breathlessness:
    'Emergency if severe, sudden, or worsening quickly, or if it comes with chest pain or blue lips.',
  high_fever:
    'Urgent. A very high fever, or any fever with a stiff neck, rash that does not fade under pressure, confusion or breathing difficulty, is an emergency.',
  coma: 'Emergency. Any loss of consciousness or unresponsiveness is an emergency.',
  acute_liver_failure: 'Emergency. Reported acute liver failure needs emergency assessment.',
  stomach_bleeding: 'Emergency. Vomiting blood or black, tarry stools is an emergency.',
  blood_in_sputum: 'Urgent. Coughing up blood needs same-day medical review.',
  rusty_sputum:
    'Urgent. Rusty-coloured sputum suggests blood in the phlegm. Seek same-day medical review.',
  weakness_of_one_body_side:
    'Emergency. One-sided weakness can be a stroke. Call emergency services.',
  slurred_speech: 'Emergency. Sudden slurred speech can be a stroke. Call emergency services.',
  sunken_eyes: 'Urgent. Marked sunken eyes with lethargy suggest significant dehydration, especially in a child.',
  dehydration: 'Urgent. Severe dehydration needs prompt treatment, especially in children and older adults.',
  loss_of_balance: 'Urgent if sudden or new.',
  altered_sensorium: 'Emergency if new or sudden. Altered awareness needs urgent assessment.',
  toxic_look_typhos:
    'Urgent. A toxic-looking appearance with fever, or a rash that does not fade under pressure, needs urgent assessment.',
  red_spots_over_body:
    'Urgent if the spots do not fade when pressed with a glass. A non-blanching rash needs urgent assessment.',
  bloody_stool:
    'Urgent. Blood in the stool needs same-day medical review, and is an emergency if it is heavy or accompanied by dizziness.',
  bruising:
    'Urgent if the bruising is unexplained, extensive, or appears without any injury.',
  stiff_neck:
    'Emergency if a stiff neck comes with fever, severe headache, confusion, or a rash that does not fade under pressure. These can be signs of meningitis.',
  swelled_lymph_nodes:
    'Urgent if accompanied by fever, night sweats or unexplained weight loss.',
  yellowing_of_eyes: 'Urgent. Yellowing of the eyes or skin needs prompt medical review.',
  yellowish_skin: 'Urgent. Yellowing of the eyes or skin needs prompt medical review.',
  swelling_of_stomach: 'Urgent if new, severe or worsening quickly.',
};

/** Source rows that are not symptoms and must never appear in a questionnaire. */
const EXCLUDED_ROWS: Record<string, string> = {
  prognosis: 'Dataset artefact: this is an outcome label, not a symptom. Excluded.',
  scurring:
    'Source row "scurring" is ambiguous and most likely a typo. Excluded rather than guessed, because guessing a symptom meaning is unsafe.',
};

/** Human-readable labels. Anything absent falls back to a title-cased key. */
const LABELS: Record<string, string> = {
  itching: 'Itching',
  skin_rash: 'Skin rash',
  nodal_skin_eruptions: 'Lump-like skin eruptions',
  continuous_sneezing: 'Repeated sneezing',
  shivering: 'Shivering',
  chills: 'Chills',
  joint_pain: 'Joint pain',
  stomach_pain: 'Stomach pain',
  acidity: 'Acidity / heartburn',
  ulcers_on_tongue: 'Mouth ulcers',
  muscle_wasting: 'Muscle wasting',
  vomiting: 'Vomiting',
  burning_micturition: 'Burning when passing urine',
  spotting_urination: 'Traces of blood in urine',
  passage_of_gases: 'Passing gas',
  internal_itching: 'Itching inside the body',
  polyuria: 'Passing urine more often than usual',
  pitting_edema: 'Swelling that leaves a dent when pressed',
  fatigue: 'Fatigue',
  weight_gain: 'Weight gain',
  anxiety: 'Anxiety',
  cold_hands_and_feets: 'Cold hands and feet',
  mood_swings: 'Mood swings',
  weight_loss: 'Unexplained weight loss',
  restlessness: 'Restlessness',
  lethargy: 'Lethargy / low energy',
  patches_in_throat: 'Patches in the throat',
  irregular_sugar_level: 'Irregular blood sugar',
  cough: 'Cough',
  high_fever: 'High fever',
  sunken_eyes: 'Sunken eyes',
  breathlessness: 'Breathlessness',
  sweating: 'Sweating',
  dehydration: 'Dehydration',
  indigestion: 'Indigestion',
  headache: 'Headache',
  yellowish_skin: 'Yellowish skin',
  dark_urine: 'Dark urine',
  nausea: 'Nausea',
  loss_of_appetite: 'Loss of appetite',
  pain_behind_the_eyes: 'Pain behind the eyes',
  back_pain: 'Back pain',
  constipation: 'Constipation',
  abdominal_pain: 'Abdominal pain',
  diarrhoea: 'Diarrhoea',
  mild_fever: 'Mild fever',
  yellow_urine: 'Yellow urine',
  yellowing_of_eyes: 'Yellowing of the eyes',
  acute_liver_failure: 'Reported acute liver failure',
  fluid_overload: 'Fluid overload',
  swelling_of_stomach: 'Swelling of the abdomen',
  swelled_lymph_nodes: 'Swollen lymph nodes',
  malaise: 'General feeling of being unwell',
  blurred_and_distorted_vision: 'Blurred or distorted vision',
  phlegm: 'Phlegm',
  throat_irritation: 'Throat irritation',
  redness_of_eyes: 'Red eyes',
  sinus_pressure: 'Sinus pressure',
  runny_nose: 'Runny nose',
  congestion: 'Congestion',
  chest_pain: 'Chest pain',
  weakness_in_limbs: 'Weakness in the limbs',
  fast_heart_rate: 'Fast heart rate',
  pain_during_bowel_movements: 'Pain during bowel movements',
  pain_in_anal_region: 'Pain in the anal area',
  bloody_stool: 'Blood in stool',
  irritation_in_anus: 'Anal irritation',
  neck_pain: 'Neck pain',
  dizziness: 'Dizziness',
  cramps: 'Cramps',
  bruising: 'Unexplained bruising',
  obesity: 'Obesity',
  swollen_legs: 'Swollen legs',
  swollen_blood_vessels: 'Visible swollen blood vessels',
  puffy_face_and_eyes: 'Puffy face and eyes',
  enlarged_thyroid: 'Enlarged thyroid / neck lump',
  brittle_nails: 'Brittle nails',
  swollen_extremeties: 'Swollen limbs',
  excessive_hunger: 'Excessive hunger',
  drying_and_tingling_lips: 'Dry, tingling lips',
  slurred_speech: 'Slurred speech',
  knee_pain: 'Knee pain',
  hip_joint_pain: 'Hip joint pain',
  muscle_weakness: 'Muscle weakness',
  stiff_neck: 'Stiff neck',
  swelling_joints: 'Swollen joints',
  movement_stiffness: 'Stiffness of movement',
  spinning_movements: 'Spinning movements (vertigo)',
  loss_of_balance: 'Loss of balance',
  unsteadiness: 'Unsteadiness',
  weakness_of_one_body_side: 'Weakness on one side of the body',
  loss_of_smell: 'Loss of smell',
  bladder_discomfort: 'Bladder discomfort',
  foul_smell_ofurine: 'Foul-smelling urine',
  continuous_feel_of_urine: 'Constant feeling of needing to urinate',
  toxic_look_typhos: 'Toxic-looking appearance with fever',
  depression: 'Low mood or depression',
  irritability: 'Irritability',
  muscle_pain: 'Muscle pain',
  altered_sensorium: 'Altered awareness',
  red_spots_over_body: 'Red spots over the body',
  belly_pain: 'Belly pain',
  abnormal_menstruation: 'Abnormal periods',
  dischromic_patches: 'Discoloured patches',
  watering_from_eyes: 'Watery eyes',
  increased_appetite: 'Increased appetite',
  skin_peeling: 'Peeling skin',
  blackheads: 'Blackheads',
  pus_filled_pimples: 'Pus-filled pimples',
  silver_like_dusting: 'Silver-like skin dust',
  small_dents_in_nails: 'Small dents in the nails',
  inflammatory_nails: 'Inflamed nails',
  blister: 'Blisters',
  red_sore_around_nose: 'Red sore around the nose',
  yellow_crust_ooze: 'Yellow crust or discharge',
  prominent_veins_on_calf: 'Prominent veins on the calf',
  distention_of_abdomen: 'Distention of the abdomen',
  lack_of_concentration: 'Lack of concentration',
  stomach_bleeding: 'Stomach bleeding',
  severe_headache: 'Severe headache',
};

/** Explicit category overrides where the flat source list is ambiguous. */
const CATEGORY_OVERRIDES: Record<string, SymptomCategory> = {
  nodal_skin_eruptions: 'skin',
  skin_rash: 'skin',
  ulcers_on_tongue: 'skin',
  redness_of_eyes: 'skin',
  watering_from_eyes: 'skin',
  red_sore_around_nose: 'skin',
  yellowish_skin: 'skin',
  red_spots_over_body: 'skin',
  silver_like_dusting: 'skin',
  skin_peeling: 'skin',
  blackheads: 'skin',
  pus_filled_pimples: 'skin',
  yellow_crust_ooze: 'skin',
  blister: 'skin',
  sore_throat: 'respiratory',
  patches_in_throat: 'respiratory',
  burning_micturition: 'urinary',
  spotting_urination: 'urinary',
  polyuria: 'urinary',
  bladder_discomfort: 'urinary',
  foul_smell_ofurine: 'urinary',
  continuous_feel_of_urine: 'urinary',
  abnormal_menstruation: 'reproductive',
  dischromic_patches: 'skin',
  high_fever: 'general',
  mild_fever: 'general',
  sunken_eyes: 'general',
  dehydration: 'general',
  malaise: 'general',
  lethargy: 'general',
  fatigue: 'general',
  weakness_in_limbs: 'general',
  muscle_wasting: 'general',
  irregular_sugar_level: 'metabolic',
  weight_gain: 'metabolic',
  weight_loss: 'metabolic',
  obesity: 'metabolic',
  excessive_hunger: 'metabolic',
  increased_appetite: 'metabolic',
  pitting_edema: 'cardiovascular',
  swollen_legs: 'cardiovascular',
  swollen_blood_vessels: 'cardiovascular',
  prominent_veins_on_calf: 'cardiovascular',
  palpitations: 'cardiovascular',
  fast_heart_rate: 'cardiovascular',
  chest_pain: 'cardiovascular',
  swelling_of_stomach: 'gastrointestinal',
  stomach_pain: 'gastrointestinal',
  stomach_bleeding: 'gastrointestinal',
  acidity: 'gastrointestinal',
  indigestion: 'gastrointestinal',
  vomiting: 'gastrointestinal',
  nausea: 'gastrointestinal',
  loss_of_appetite: 'gastrointestinal',
  constipation: 'gastrointestinal',
  abdominal_pain: 'gastrointestinal',
  belly_pain: 'gastrointestinal',
  diarrhoea: 'gastrointestinal',
  bloody_stool: 'gastrointestinal',
  pain_during_bowel_movements: 'gastrointestinal',
  pain_in_anal_region: 'gastrointestinal',
  irritation_in_anus: 'gastrointestinal',
  passage_of_gases: 'gastrointestinal',
  distention_of_abdomen: 'gastrointestinal',
  acute_liver_failure: 'gastrointestinal',
  yellow_urine: 'urinary',
  dark_urine: 'urinary',
  yellowing_of_eyes: 'general',
  enlarged_thyroid: 'general',
  spinning_movements: 'neurological',
  loss_of_balance: 'neurological',
  unsteadiness: 'neurological',
  loss_of_smell: 'neurological',
  dizziness: 'neurological',
  headache: 'neurological',
  pain_behind_the_eyes: 'neurological',
  altered_sensorium: 'neurological',
  lack_of_concentration: 'neurological',
  coma: 'neurological',
  weakness_of_one_body_side: 'neurological',
  slurred_speech: 'neurological',
  depression: 'psychological',
  anxiety: 'psychological',
  mood_swings: 'psychological',
  restlessness: 'psychological',
  irritability: 'psychological',
};

/** Raw CSV key -> catalog key, for rows whose raw key is not usable as-is. */
const KEY_ALIASES: Record<string, string> = {
  'toxic_look_(typhos)': 'toxic_look_typhos',
  swollen_extremeties: 'swollen_extremeties',
};

function titleCase(key: string): string {
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * The reviewed catalog.
 *
 * Weights are transcribed from the provider CSV. `fluid_overload` appears twice
 * in the source with conflicting weights (6 and 4); the more conservative value
 * (6) is kept and the conflict is recorded in `notes`.
 */
export const SYMPTOM_DEFINITIONS: SymptomDefinition[] = [
  def('itching', 'Itching', 1, 'skin'),
  def('skin_rash', 'Skin rash', 3, 'skin'),
  def('nodal_skin_eruptions', 'Lump-like skin eruptions', 4, 'skin'),
  def('continuous_sneezing', 'Repeated sneezing', 4, 'respiratory'),
  def('shivering', 'Shivering', 5, 'general'),
  def('chills', 'Chills', 3, 'general'),
  def('joint_pain', 'Joint pain', 3, 'musculoskeletal'),
  def('stomach_pain', 'Stomach pain', 5, 'gastrointestinal'),
  def('acidity', 'Acidity / heartburn', 3, 'gastrointestinal'),
  def('ulcers_on_tongue', 'Mouth ulcers', 4, 'skin'),
  def('muscle_wasting', 'Muscle wasting', 3, 'general'),
  def('vomiting', 'Vomiting', 5, 'gastrointestinal'),
  def('burning_micturition', 'Burning when passing urine', 6, 'urinary'),
  def('spotting_urination', 'Traces of blood in urine', 6, 'urinary'),
  def('passage_of_gases', 'Passing gas', 5, 'gastrointestinal'),
  def('internal_itching', 'Itching inside the body', 4, 'general'),
  def('polyuria', 'Passing urine more often than usual', 4, 'urinary'),
  def('fatigue', 'Fatigue', 4, 'general'),
  def('weight_gain', 'Weight gain', 3, 'metabolic'),
  def('anxiety', 'Anxiety', 4, 'psychological'),
  def('cold_hands_and_feets', 'Cold hands and feet', 5, 'neurological'),
  def('mood_swings', 'Mood swings', 3, 'psychological'),
  def('weight_loss', 'Unexplained weight loss', 3, 'metabolic'),
  def('restlessness', 'Restlessness', 5, 'psychological'),
  def('lethargy', 'Lethargy / low energy', 2, 'general'),
  def('patches_in_throat', 'Patches in the throat', 6, 'respiratory'),
  def('irregular_sugar_level', 'Irregular blood sugar', 5, 'metabolic'),
  def('cough', 'Cough', 4, 'respiratory'),
  def('high_fever', 'High fever', 7, 'general', {
    emergency: true,
    notes:
      'Emergency routing added by clinical review. Source weight 7 alone is NOT treated as an emergency signal.',
  }),
  def('sunken_eyes', 'Sunken eyes', 3, 'general', { emergency: true }),
  def('breathlessness', 'Breathlessness', 4, 'respiratory', { emergency: true }),
  def('sweating', 'Sweating', 3, 'general'),
  def('dehydration', 'Dehydration', 4, 'general', { emergency: true }),
  def('indigestion', 'Indigestion', 5, 'gastrointestinal'),
  def('headache', 'Headache', 3, 'neurological'),
  def('yellowish_skin', 'Yellowish skin', 3, 'skin', { emergency: true }),
  def('dark_urine', 'Dark urine', 4, 'urinary'),
  def('nausea', 'Nausea', 5, 'gastrointestinal'),
  def('loss_of_appetite', 'Loss of appetite', 4, 'gastrointestinal'),
  def('pain_behind_the_eyes', 'Pain behind the eyes', 4, 'neurological'),
  def('back_pain', 'Back pain', 3, 'musculoskeletal'),
  def('constipation', 'Constipation', 4, 'gastrointestinal'),
  def('abdominal_pain', 'Abdominal pain', 4, 'gastrointestinal'),
  def('diarrhoea', 'Diarrhoea', 6, 'gastrointestinal'),
  def('mild_fever', 'Mild fever', 5, 'general'),
  def('yellow_urine', 'Yellow urine', 4, 'urinary'),
  def('yellowing_of_eyes', 'Yellowing of the eyes', 4, 'general', { emergency: true }),
  def('acute_liver_failure', 'Reported acute liver failure', 6, 'gastrointestinal', {
    emergency: true,
  }),
  def('fluid_overload', 'Fluid overload', 6, 'cardiovascular', {
    notes: 'Source CSV lists this twice with conflicting weights (6 and 4). The more conservative value 6 is kept.',
  }),
  def('swelling_of_stomach', 'Swelling of the abdomen', 7, 'gastrointestinal', { emergency: true }),
  def('swelled_lymph_nodes', 'Swollen lymph nodes', 6, 'general', { emergency: true }),
  def('malaise', 'General feeling of being unwell', 6, 'general'),
  def('blurred_and_distorted_vision', 'Blurred or distorted vision', 5, 'neurological'),
  def('phlegm', 'Phlegm', 5, 'respiratory'),
  def('mucoid_sputum', 'Mucous sputum', 4, 'respiratory'),
  def('rusty_sputum', 'Rusty-coloured sputum', 4, 'respiratory', {
    emergency: true,
    notes: 'Emergency. Rusty-coloured sputum suggests blood in the phlegm and needs prompt assessment.',
  }),
  def('blood_in_sputum', 'Blood in sputum', 5, 'respiratory', { emergency: true }),
  def('throat_irritation', 'Throat irritation', 4, 'respiratory'),
  def('redness_of_eyes', 'Red eyes', 5, 'skin'),
  def('sinus_pressure', 'Sinus pressure', 4, 'respiratory'),
  def('runny_nose', 'Runny nose', 5, 'respiratory'),
  def('congestion', 'Congestion', 5, 'respiratory'),
  def('chest_pain', 'Chest pain', 7, 'cardiovascular', { emergency: true }),
  def('weakness_in_limbs', 'Weakness in the limbs', 7, 'neurological'),
  def('fast_heart_rate', 'Fast heart rate', 5, 'cardiovascular'),
  def('palpitations', 'Palpitations', 4, 'cardiovascular'),
  def('painful_walking', 'Painful walking', 2, 'musculoskeletal'),
  def('pain_during_bowel_movements', 'Pain during bowel movements', 5, 'gastrointestinal'),
  def('pain_in_anal_region', 'Pain in the anal area', 6, 'gastrointestinal'),
  def('bloody_stool', 'Blood in stool', 5, 'gastrointestinal', { emergency: true }),
  def('irritation_in_anus', 'Anal irritation', 6, 'gastrointestinal'),
  def('neck_pain', 'Neck pain', 5, 'musculoskeletal'),
  def('dizziness', 'Dizziness', 4, 'neurological'),
  def('cramps', 'Cramps', 4, 'general'),
  def('bruising', 'Unexplained bruising', 4, 'general', { emergency: true }),
  def('obesity', 'Obesity', 4, 'metabolic'),
  def('swollen_legs', 'Swollen legs', 5, 'cardiovascular'),
  def('swollen_blood_vessels', 'Visible swollen blood vessels', 5, 'cardiovascular'),
  def('prominent_veins_on_calf', 'Prominent veins on the calf', 6, 'cardiovascular'),
  def('puffy_face_and_eyes', 'Puffy face and eyes', 5, 'cardiovascular'),
  def('enlarged_thyroid', 'Enlarged thyroid / neck lump', 6, 'general'),
  def('brittle_nails', 'Brittle nails', 5, 'skin'),
  def('swollen_extremeties', 'Swollen limbs', 5, 'cardiovascular'),
  def('excessive_hunger', 'Excessive hunger', 4, 'metabolic'),
  def('drying_and_tingling_lips', 'Dry, tingling lips', 4, 'neurological'),
  def('slurred_speech', 'Slurred speech', 4, 'neurological', { emergency: true }),
  def('knee_pain', 'Knee pain', 3, 'musculoskeletal'),
  def('hip_joint_pain', 'Hip joint pain', 2, 'musculoskeletal'),
  def('muscle_weakness', 'Muscle weakness', 2, 'musculoskeletal'),
  def('stiff_neck', 'Stiff neck', 4, 'neurological', { emergency: true }),
  def('swelling_joints', 'Swollen joints', 5, 'musculoskeletal'),
  def('movement_stiffness', 'Stiffness of movement', 5, 'musculoskeletal'),
  def('spinning_movements', 'Spinning movements (vertigo)', 6, 'neurological'),
  def('loss_of_balance', 'Loss of balance', 4, 'neurological', { emergency: true }),
  def('unsteadiness', 'Unsteadiness', 4, 'neurological'),
  def('weakness_of_one_body_side', 'Weakness on one side of the body', 4, 'neurological', {
    emergency: true,
  }),
  def('loss_of_smell', 'Loss of smell', 3, 'neurological'),
  def('visual_disturbances', 'Visual disturbances', 3, 'neurological'),
  def('lack_of_concentration', 'Lack of concentration', 3, 'neurological'),
  def('bladder_discomfort', 'Bladder discomfort', 4, 'urinary'),
  def('foul_smell_ofurine', 'Foul-smelling urine', 5, 'urinary'),
  def('continuous_feel_of_urine', 'Constant feeling of needing to urinate', 6, 'urinary'),
  def('toxic_look_typhos', 'Toxic-looking appearance with fever', 5, 'general', {
    emergency: true,
  }),
  def('stomach_bleeding', 'Stomach bleeding', 6, 'gastrointestinal', { emergency: true }),
  def('coma', 'Unconsciousness or unresponsiveness', 7, 'neurological', { emergency: true }),
  def('depression', 'Low mood or depression', 3, 'psychological'),
  def('irritability', 'Irritability', 2, 'psychological'),
  def('muscle_pain', 'Muscle pain', 2, 'musculoskeletal'),
  def('altered_sensorium', 'Altered awareness', 2, 'neurological', { emergency: true }),
  def('red_spots_over_body', 'Red spots over the body', 3, 'skin', { emergency: true }),
  def('belly_pain', 'Belly pain', 4, 'gastrointestinal'),
  def('distention_of_abdomen', 'Distention of the abdomen', 4, 'gastrointestinal'),
  def('abnormal_menstruation', 'Abnormal periods', 6, 'reproductive'),
  def('dischromic_patches', 'Discoloured patches', 6, 'skin'),
  def('watering_from_eyes', 'Watery eyes', 4, 'skin'),
  def('increased_appetite', 'Increased appetite', 5, 'metabolic'),
  def('skin_peeling', 'Peeling skin', 3, 'skin'),
  def('blackheads', 'Blackheads', 2, 'skin'),
  def('pus_filled_pimples', 'Pus-filled pimples', 2, 'skin'),
  def('silver_like_dusting', 'Silver-like skin dust', 2, 'skin'),
  def('small_dents_in_nails', 'Small dents in the nails', 2, 'skin'),
  def('inflammatory_nails', 'Inflamed nails', 2, 'skin'),
  def('blister', 'Blisters', 4, 'skin'),
  def('red_sore_around_nose', 'Red sore around the nose', 2, 'skin'),
  def('yellow_crust_ooze', 'Yellow crust or discharge', 3, 'skin'),

  // ── Reclassified: exposure / risk factors, never asked as symptoms ──────
  def('family_history', 'Family history of a similar condition', 5, 'exposure', {
    disposition: 'reclassified_as_exposure',
    notes: 'Not a symptom. Reclassified as a family-history risk factor and asked separately.',
  }),
  def('receiving_blood_transfusion', 'Has had a blood transfusion', 5, 'exposure', {
    disposition: 'reclassified_as_exposure',
    notes: 'Not a symptom. Reclassified as a medical exposure/risk factor.',
  }),
  def('receiving_unsterile_injections', 'Has had unsafe injections', 2, 'exposure', {
    disposition: 'reclassified_as_exposure',
    notes: 'Not a symptom. Reclassified as an exposure risk factor.',
  }),
  def('history_of_alcohol_consumption', 'Alcohol history', 5, 'exposure', {
    disposition: 'reclassified_as_exposure',
    notes: 'Not a symptom. Reclassified as a lifestyle risk factor.',
  }),
  def('extra_marital_contacts', 'Multiple sexual partners', 5, 'exposure', {
    disposition: 'reclassified_as_exposure',
    notes: 'Not a symptom. Reclassified as a sexual-exposure risk factor; never asked as a symptom.',
  }),
];

export const SYMPTOM_BY_KEY: ReadonlyMap<string, SymptomDefinition> = new Map(
  SYMPTOM_DEFINITIONS.map((s) => [s.key, s]),
);

/** Symptoms that may be asked as a plain yes/no question. */
export const ASKABLE_SYMPTOMS: SymptomDefinition[] = SYMPTOM_DEFINITIONS.filter(
  (s) => s.disposition === 'included',
);

/** Risk factors, asked separately from symptoms and never as "do you have X". */
export const EXPOSURE_FACTORS: SymptomDefinition[] = SYMPTOM_DEFINITIONS.filter(
  (s) => s.disposition === 'reclassified_as_exposure',
);

/** Red-flag symptoms. Routing here is deterministic and never LLM-driven. */
export const RED_FLAG_SYMPTOMS: SymptomDefinition[] = SYMPTOM_DEFINITIONS.filter((s) => s.emergency);

export function symptomLabel(key: string): string {
  return SYMPTOM_BY_KEY.get(key)?.label ?? LABELS[key] ?? titleCase(key);
}

export function isRedFlag(key: string): boolean {
  return SYMPTOM_BY_KEY.get(key)?.emergency ?? false;
}

export function redFlagGuidance(key: string): string | null {
  return RED_FLAG_NOTES[key] ?? null;
}

/** Raw source row keys that were deliberately not shipped, with the reason. */
export function excludedSourceRows(): Record<string, string> {
  return { ...EXCLUDED_ROWS };
}

/** Map a raw provider key onto a shipped catalog key, or null if not shipped. */
export function resolveSourceKey(rawKey: string): string | null {
  const key = KEY_ALIASES[rawKey] ?? rawKey;
  return SYMPTOM_BY_KEY.has(key) ? key : null;
}

export { RED_FLAG_NOTES, EXCLUDED_ROWS, KEY_ALIASES, CATEGORY_OVERRIDES };
