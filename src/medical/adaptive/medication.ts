/**
 * Over-the-counter guidance.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CLINICAL REVIEW REQUIRED — AND A PHARMACIST SPECIFICALLY
 *
 * This module suggests *categories* of over-the-counter product. It never names a
 * medicine, never gives a dose, and never tells somebody to start treating
 * themselves in place of being assessed. A pharmacist must review the category
 * list, the blocks and the patient-facing wording before real use.
 *
 * See `REVIEW_STATUS` in `types.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ── Why categories and not medicines ─────────────────────────────────────────
 *
 * The requirements for this project were explicit on this point, and the reasoning
 * is worth preserving: naming a specific product turns a triage tool into a
 * prescribing tool. It creates a dose question this module cannot answer
 * responsibly, it ignores the interaction with whatever the patient is already
 * taking, and it is exactly the thing that goes wrong when a screen has missed
 * something. "Ask a pharmacist about an antihistamine" cannot be wrong in the way
 * "take 400mg of X every six hours" can.
 *
 * ── The default is to say less ───────────────────────────────────────────────
 *
 * Every gate below fails towards *not* suggesting something. An unknown age, an
 * unanswered allergy question, a free-text answer that cannot be parsed — all of
 * them suppress rather than permit. That direction is deliberate: an unnecessary
 * sentence of advice is a smaller harm than a suggestion that should not have been
 * made.
 */
import type { HaltDecision, PatientProfile } from './types';
import { profileFlagSet, firstAnswer } from './profile';
import { EvalContext, topicReported } from './conditions';

export type OtcCategoryId =
  | 'analgesic'
  | 'antipyretic'
  | 'antiemetic'
  | 'oral_rehydration'
  | 'antihistamine'
  | 'throat_soothing'
  | 'nasal_saline'
  | 'cough_soothing'
  | 'antidiarrhoeal'
  | 'skin_barrier';

/** One category of product, described without naming a product. */
interface OtcCategory {
  id: OtcCategoryId;
  label: string;
  /** What it is for, in the words a patient would use. */
  forWhat: string;
  /** Complaints where this category is the wrong answer even at a dose of zero. */
  neverFor: string[];
  /** Phrases that should stop this category being offered. */
  blockedByPhrases: string[];
}

const CATEGORIES: OtcCategory[] = [
  {
    id: 'analgesic',
    label: 'A simple painkiller',
    forWhat: 'Headache, body aches and general aches.',
    neverFor: [
      'Abdominal pain of unknown cause, where painkillers can hide a serious cause until it is advanced.',
      'Headache that is sudden and severe, or comes with weakness, vision changes or a fever with a stiff neck.',
    ],
    blockedByPhrases: ['liver', 'kidney', 'renal', 'ulcer', 'stomach ulcer', 'gastritis', 'blood thinner', 'anticoagulant', 'pregnan', 'breastfeed'],
  },
  {
    id: 'antipyretic',
    label: 'A fever-reducing medicine',
    forWhat: 'Bringing a temperature down and easing the aches that come with a fever.',
    neverFor: [
      'A baby under three months with a fever — that needs to be seen today, not treated at home.',
      'A fever that has lasted more than a week, or is very high, or is making somebody confused or drowsy.',
    ],
    blockedByPhrases: ['liver', 'kidney', 'renal', 'ulcer', 'stomach ulcer', 'gastritis', 'dehydration', 'pregnan', 'breastfeed'],
  },
  {
    id: 'antiemetic',
    label: 'An anti-sickness medicine',
    forWhat: 'Nausea and vomiting, where nothing serious has been found.',
    neverFor: [
      'Vomiting with a severe headache or a stiff neck.',
      'Vomiting with blood in it, or with a swollen abdomen.',
      'Vomiting where fluids cannot be kept down at all — that is a dehydration risk and needs assessment.',
    ],
    // Blocked outright in pregnancy and breastfeeding rather than cautioned: the
    // whole class is the question a pharmacist needs to answer, and asking the
    // patient to raise it themselves is not good enough.
    blockedByPhrases: ['pregnan', 'breastfeed'],
  },
  {
    id: 'oral_rehydration',
    label: 'An oral rehydration solution',
    forWhat: 'Replacing fluids and salts after vomiting or diarrhoea.',
    neverFor: [
      'Somebody who cannot keep fluids down at all, or is passing almost no urine — that needs assessment now.',
      'Anywhere it would delay medical care for diarrhoea with blood, or a suspected outbreak.',
    ],
    blockedByPhrases: ['kidney', 'renal', 'heart failure', 'fluid overload', 'swollen legs', 'pregnan', 'breastfeed'],
  },
  {
    id: 'antihistamine',
    label: 'A non-drowsy antihistamine',
    forWhat: 'Itchy skin, hives and sneezing.',
    neverFor: [
      'Swelling of the lips, tongue or face, or a tight throat — that is an emergency, not an antihistamine.',
      'Somebody who is already drowsy or confused.',
    ],
    blockedByPhrases: ['pregnan', 'breastfeed', 'glaucoma', 'prostate'],
  },
  {
    id: 'throat_soothing',
    label: 'A throat-soothing product',
    forWhat: 'A sore or scratchy throat, and the cough that comes with it.',
    neverFor: [
      'Difficulty swallowing, a lump in the neck, or a throat that has been painful for more than about a week.',
      'A stiff neck with a fever.',
    ],
    blockedByPhrases: [],
  },
  {
    id: 'nasal_saline',
    label: 'A saline nasal spray or rinse',
    forWhat: 'A blocked or runny nose.',
    neverFor: ['Recent facial surgery, or a nosebleed that has not settled.'],
    blockedByPhrases: [],
  },
  {
    id: 'cough_soothing',
    label: 'A cough-suppressing medicine',
    forWhat: 'A dry cough that is keeping somebody awake.',
    neverFor: [
      'Coughing up blood, breathlessness, chest pain, or a cough with a fever that is not settling.',
      'A cough in a child under six — cough medicines are not recommended for them.',
    ],
    // The concern here is the sedating class, so a drowsy or confused patient is
    // blocked from it for the same reason asthma is: the combination is the risk.
    blockedByPhrases: ['asthma', 'drows', 'confus', 'sedat', 'alcohol', 'pregnan', 'breastfeed'],
  },
  {
    id: 'antidiarrhoeal',
    label: 'An anti-diarrhoeal medicine',
    forWhat: 'Short-lived diarrhoea, once it is settling.',
    neverFor: [
      'Diarrhoea with blood, or with a fever, or with severe abdominal pain.',
      'Diarrhoea in somebody who cannot keep fluids down — this makes dehydration worse, not better.',
    ],
    blockedByPhrases: ['pregnan', 'breastfeed', 'fever', 'blood'],
  },
  {
    id: 'skin_barrier',
    label: 'An unperfumed emollient or barrier cream',
    forWhat: 'Dry or irritated skin, and helping avoid further irritation.',
    neverFor: [
      'A rash that does not fade when pressed, or a rash with a fever — that needs assessment, not a cream.',
    ],
    blockedByPhrases: [],
  },
];

const CATEGORY_BY_ID: ReadonlyMap<OtcCategoryId, OtcCategory> = new Map(
  CATEGORIES.map((category) => [category.id, category]),
);

export interface OtcSuggestion {
  category: OtcCategoryId;
  label: string;
  /** Why this category, phrased back from what they told us. */
  because: string;
  /** When this category is the wrong answer despite everything else. */
  neverFor: string[];
  /** Anything they should raise with a pharmacist before buying. */
  askPharmacist: string[];
}

export interface MedicationAdvice {
  /**
   * True when nothing at all may be suggested.
   *
   * Binding, not advisory: while this is true the UI must not render a single
   * product category, and the reason is always given so the absence is explained
   * rather than looking like an oversight.
   */
  suppressed: boolean;
  /** Why suppression happened. Present exactly when `suppressed` is true. */
  suppressedReason?: string;
  suggestions: OtcSuggestion[];
  /** Always shown: the advice that does not depend on any product. */
  generalAdvice: string[];
}

// ── Context from the presentation ─────────────────────────────────────────────

/** The complaints present, as topics, so a category can require the right one. */
interface Presentation {
  hasAbdominalPain: boolean;
  hasFever: boolean;
  hasPain: boolean;
  hasHeadache: boolean;
  hasSoreThroat: boolean;
  hasCough: boolean;
  hasBlockedNose: boolean;
  hasVomiting: boolean;
  hasDiarrhoea: boolean;
  hasItchySkin: boolean;
  hasUrinaryPain: boolean;
  severity: number | null;
  worsening: boolean;
}

function presentation(context: EvalContext): Presentation {
  // `context.symptoms` is the intake picker's output — real catalog keys such as
  // `runny_nose` — plus any symptom key answered `yes`. Note that the matched
  // `symptomSets` are set *ids*, which carry questions rather than symptom keys,
  // so they cannot stand in for this: a category must be offered on the strength
  // of what the person actually reported.
  const symptoms = context.symptoms;
  const has = (...keys: string[]): boolean => keys.some((key) => symptoms.has(key));

  // There is no `fever` key in the catalog: the intake symptoms are `mild_fever`
  // and `high_fever`, and `chills`/`shivering` are their own entries. Reading a
  // non-existent `fever` key is why this needs verifying rather than assuming.
  const hasFever =
    has('mild_fever', 'high_fever', 'chills', 'shivering') ||
    topicReported('red_flag.fever_present', context);

  // Abdominal pain is the one exclusion that matters more than the granularity of
  // the symptom list, so it is read from the answers as well as the intake picker:
  // somebody can arrive on "vomiting and diarrhoea" and only reveal the abdominal
  // pain when asked.
  const abdominal =
    has('abdominal_pain', 'stomach_pain', 'belly_pain', 'distention_of_abdomen') ||
    firstAnswer(context.profile, ['abdo_location', 'belly_pain_location', 'abdo_pattern']) !== undefined;

  return {
    hasAbdominalPain: abdominal,
    hasFever,
    hasPain: has('chest_pain', 'abdominal_pain', 'back_pain', 'headache', 'joint_pain', 'muscle_pain', 'stomach_pain'),
    hasHeadache: has('headache'),
    hasSoreThroat: has('patches_in_throat', 'throat_irritation'),
    hasCough: has('cough', 'phlegm', 'mucoid_sputum'),
    hasBlockedNose: has('congestion', 'runny_nose', 'sinus_pressure'),
    hasVomiting: has('vomiting', 'nausea'),
    hasDiarrhoea: has('diarrhoea'),
    hasItchySkin: has('skin_rash', 'itching', 'nodal_skin_eruptions', 'skin_peeling', 'blister'),
    hasUrinaryPain: has('burning_micturition', 'bladder_discomfort'),
    severity: context.severity,
    worsening: context.worsening,
  };
}

/** Does this category apply to what they actually reported? */
function isRelevantTo(category: OtcCategory, view: Presentation): boolean {
  switch (category.id) {
    case 'analgesic':
      // Deliberately never for an unexplained abdominal pain: masking it delays
      // the diagnosis rather than helping with it.
      return view.hasPain && !view.hasAbdominalPain;
    case 'antipyretic':
      return view.hasFever;
    case 'antiemetic':
      return view.hasVomiting;
    case 'oral_rehydration':
      return view.hasVomiting || view.hasDiarrhoea;
    case 'antihistamine':
      return view.hasItchySkin;
    case 'throat_soothing':
      return view.hasSoreThroat || (view.hasCough && !view.hasFever);
    case 'nasal_saline':
      return view.hasBlockedNose;
    case 'cough_soothing':
      return view.hasCough;
    case 'antidiarrhoeal':
      return view.hasDiarrhoea;
    case 'skin_barrier':
      return view.hasItchySkin;
    default:
      return false;
  }
}


/** Why a category is being offered, in the patient's own terms. */
function reasonFor(category: OtcCategoryId, view: Presentation): string {
  switch (category) {
    case 'analgesic':
      return view.hasHeadache ? 'You have reported headache.' : 'You have reported pain.';
    case 'antipyretic':
      return 'You have reported a temperature.';
    case 'antiemetic':
      return 'You have reported feeling sick or being sick.';
    case 'oral_rehydration':
      return view.hasDiarrhoea
        ? 'You have reported diarrhoea, where replacing fluids and salts is the main thing that helps.'
        : 'You have reported being sick, where replacing fluids matters more than anything else.';
    case 'antihistamine':
      return 'You have reported an itchy rash.';
    case 'throat_soothing':
      return view.hasSoreThroat ? 'You have reported a sore throat.' : 'You have reported a cough.';
    case 'nasal_saline':
      return 'You have reported a blocked or runny nose.';
    case 'cough_soothing':
      return 'You have reported a cough.';
    case 'antidiarrhoeal':
      return 'You have reported diarrhoea.';
    case 'skin_barrier':
      return 'You have reported irritated skin.';
    default:
      return '';
  }
}

// ── Blocking ──────────────────────────────────────────────────────────────────

/** A phrase in a free-text answer that must stop a category being offered. */
function phrasesIn(profile: PatientProfile): string {
  return [
    profile.freeText,
    firstAnswer(profile, ['existing_conditions', 'condition_list', 'known_allergies', 'allergy_list', 'medication_list']) ?? '',
  ]
    .join(' \n ')
    .toLowerCase();
}

/**
 * Hard stops that apply before any category is considered.
 *
 * Each one is a situation where "ask a pharmacist about a painkiller" is the wrong
 * shape of sentence to send.
 */
function suppressionReason(
  profile: PatientProfile,
  context: EvalContext,
  halt: HaltDecision | null,
): string | null {
  // 1. A red flag. Binding: no self-medication guidance at all, even for the part
  //    of the complaint that looks benign. That was the agreed behaviour, and it is
  //    the rule most worth keeping: someone who cannot breathe is not helped by a
  //    paragraph about saline sprays.
  if (halt && halt.suppressMedication) {
    return `Because this needs medical assessment first (${halt.title.toLowerCase()}), no self-treatment advice is shown.`;
  }

  // 2. A reaction to something already taken is still in progress.
  if (firstAnswer(profile, ['medication_taken_now_worse']) === 'yes') {
    return 'Because something you took made this worse, this needs a pharmacist or clinician to look at it before anything else is added.';
  }

  // 3. A severe allergic reaction reported anywhere. Not "a rash" — an anaphylaxis
  //    screen that came back positive.
  if (topicReported('red_flag.severe_allergic_reaction', context)) {
    return 'Because there is a possible severe allergic reaction, this needs emergency assessment rather than self-treatment.';
  }

  // 4. Dehydration. Advice to treat the vomiting while the person cannot keep
  //    fluids down is advice that delays the thing that helps.
  if (topicReported('red_flag.dehydration', context)) {
    return 'Because you may not be keeping fluids down, this needs to be assessed today rather than treated at home.';
  }

  // 5. Reduced awareness or a stroke pattern. Same reasoning: the person cannot
  //    safely manage their own treatment.
  if (topicReported('red_flag.altered_sensorium', context) || topicReported('red_flag.stroke', context)) {
    return 'Because this is being assessed as an urgent problem, no self-treatment advice is shown.';
  }

  // 6. Pregnancy that is confirmed. A hard stop, because "ask your pharmacist if
  //    you are pregnant" puts the work on the patient at the exact moment they are
  //    least able to do it.
  //
  //    Only *confirmed* pregnancy stops the whole list. The softer
  //    `pregnant_or_unknown` flag — a woman of reproductive age we have not asked
  //    yet — deliberately does not appear here: it does not mean she might be
  //    pregnant, it means we have not asked, and the questionnaire is about to.
  //    Treating it as a stop would suppress every category for most female
  //    patients, which is the same as not having built this module. It is handled
  //    in `pregnancyCaution` below, as a pharmacist caution on the categories where
  //    it actually changes something.
  const flags = profileFlagSet(profile);
  if (flags.has('pregnant')) {
    return 'Because you are pregnant, a pharmacist needs to choose anything you take.';
  }

  // 7. Breastfeeding, same reasoning, and likewise only once confirmed.
  if (flags.has('breastfeeding')) {
    return 'Because you are breastfeeding, a pharmacist needs to choose anything you take.';
  }

  // 8. Age at the extremes, where adult product advice is simply not applicable.
  const age = profile.ageYears;
  if (age !== null && Number.isFinite(age) && age < 1) {
    return 'Because this is a baby, nothing should be given without advice from a clinician or pharmacist today.';
  }

  return null;
}

/**
 * The pregnancy caution for a patient whose status we have not established.
 *
 * Applies only to the categories where pregnancy genuinely changes the choice. A
 * throat lozenge is not worth a warning; an anti-sickness medicine and a painkiller
 * are. This is the difference between advice that helps and advice that trains
 * people to ignore the warnings.
 */
function pregnancyCaution(profile: PatientProfile, category: OtcCategory): string | null {
  if (!profileFlagSet(profile).has('pregnant_or_unknown')) return null;

  switch (category.id) {
    case 'antiemetic':
      return 'Anti-sickness medicines are the ones most affected by pregnancy, so please tell the pharmacist if you are or might be.';
    case 'analgesic':
    case 'antipyretic':
      return 'Please tell the pharmacist if you are or might be pregnant — it changes what is safe to take.';
    case 'antidiarrhoeal':
    case 'oral_rehydration':
      return 'Please tell the pharmacist if you are or might be pregnant.';
    default:
      return null;
  }
}

/**
 * Whether this specific category is blocked for this patient.
 *
 * Returns the reason rather than a boolean, because the reason is the useful part:
 * "you have told us about a stomach ulcer" is more use to somebody than a silently
 * shorter list.
 */
function blockReason(
  category: OtcCategory,
  profile: PatientProfile,
  context: EvalContext,
): string | null {
  const flags = profileFlagSet(profile);
  const age = profile.ageYears;
  const text = phrasesIn(profile);

  const blocked = category.blockedByPhrases.some((phrase) => text.includes(phrase));

  // Named-phrase blocks are the coarse layer: they catch a condition mentioned in
  // the free text or the conditions list. Flags are the precise layer.
  if (blocked) return `You have told us about something on this list (${category.label.toLowerCase()}) that means a pharmacist should choose this instead.`;

  switch (category.id) {
    case 'analgesic':
    case 'antipyretic':
      if (flags.has('liver_risk')) {
        return 'You have told us about a liver problem, and this is a category a pharmacist should not suggest without checking first.';
      }
      if (flags.has('kidney_risk')) {
        return 'You have told us about a kidney problem, and this is a category that may need avoiding altogether.';
      }
      if (flags.has('ulcer_history')) {
        return 'You have told us about ulcers or a previous stomach bleed, and painkillers of this kind can make that worse.';
      }
      if (flags.has('cardiac_risk')) {
        return 'You have told us about a heart problem, which means this category needs a pharmacist rather than a shelf.';
      }
      return null;

    case 'antiemetic':
      if (flags.has('pregnant') || flags.has('pregnant_or_unknown') || flags.has('breastfeeding')) {
        return 'Anti-sickness medicines are the ones most affected by pregnancy and breastfeeding, so a pharmacist should choose.';
      }
      return null;

    case 'antihistamine':
      if (flags.has('pregnant') || flags.has('pregnant_or_unknown') || flags.has('breastfeeding')) {
        return 'A pharmacist should choose an antihistamine rather than this.';
      }
      return null;

    case 'cough_soothing':
      if (flags.has('asthma')) {
        return 'Cough-suppressing medicines can be a problem with asthma and with other chest conditions.';
      }
      if (age !== null && Number.isFinite(age) && age < 6) {
        return 'Cough medicines are not recommended for children under six.';
      }
      if (context.worsening) {
        return 'A cough that is getting worse should be looked at rather than suppressed.';
      }
      return null;

    case 'antidiarrhoeal':
      if (age !== null && Number.isFinite(age) && age < 6) {
        return 'Anti-diarrhoeal medicines are not recommended for young children.';
      }
      return null;

    case 'oral_rehydration':
      if (flags.has('kidney_risk') || flags.has('cardiac_risk')) {
        return 'Fluid replacement needs to be right for somebody with a kidney or heart problem, so a pharmacist should advise.';
      }
      return null;

    default:
      return null;
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

/** Advice that holds regardless of which categories are available. */
const GENERAL_ADVICE = [
  'This is general information, not a diagnosis, and it cannot see what a physical examination or a test would find.',
  'If any of this changes, or you are not sure, contact a pharmacist or a clinician rather than treating it yourself.',
];

export function medicationAdvice(
  profile: PatientProfile,
  context: EvalContext,
  halt: HaltDecision | null,
): MedicationAdvice {
  const reason = suppressionReason(profile, context, halt);
  if (reason) {
    return { suppressed: true, suppressedReason: reason, suggestions: [], generalAdvice: GENERAL_ADVICE };
  }

  const view = presentation(context);
  const suggestions: OtcSuggestion[] = [];

  for (const category of CATEGORIES) {
    if (!isRelevantTo(category, view)) continue;
    if (blockReason(category, profile, context)) continue;

    const caution = pregnancyCaution(profile, category);
    suggestions.push({
      category: category.id,
      label: category.label,
      because: reasonFor(category.id, view),
      neverFor: category.neverFor,
      askPharmacist: [
        'Check with a pharmacist before buying, especially if you take anything else regularly.',
        'Tell them about any allergy you have, even one that has never caused a reaction.',
        ...(caution ? [caution] : []),
      ],
    });
  }

  // Three at most. A long list reads as an instruction to take all of them, and
  // this tool is not in a position to know which combination is right.
  return {
    suppressed: false,
    suggestions: suggestions.slice(0, 3),
    generalAdvice: GENERAL_ADVICE,
  };
}

/** Exposed for the reviewer-facing documentation surface. */
export function otcCategoryIds(): OtcCategoryId[] {
  return CATEGORIES.map((category) => category.id);
}

export function otcCategory(id: OtcCategoryId): OtcCategory | undefined {
  return CATEGORY_BY_ID.get(id);
}
