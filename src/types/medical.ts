/**
 * Core medical domain types.
 *
 * Design rule that the whole system depends on:
 * every clinically meaningful value carries an explicit `provenance` tag so we
 * can always answer "where did this number/claim come from?".
 */

// ── Provenance ──────────────────────────────────────────────────────────────

export const PROVENANCE = {
  /** Extracted verbatim from the user's own uploaded report. */
  USER_REPORT: 'user_report',
  /** Reference interval printed on the user's own report. */
  REPORT_REFERENCE_RANGE: 'report_reference_range',
  /** From the curated, clinician-reviewed knowledge base (tables). */
  KNOWLEDGE_BASE: 'knowledge_base',
  /** Deterministically computed by our own code (arithmetic, range checks). */
  COMPUTED: 'computed',
  /** Free-text produced by a language model, and not yet verified. */
  AI_GENERATED: 'ai_generated',
  /** Entered by the user, or reported by the user in their own words. */
  USER_REPORTED: 'user_reported',
} as const;

export type Provenance = (typeof PROVENANCE)[keyof typeof PROVENANCE];

export interface Sourced<T> {
  value: T;
  provenance: Provenance;
  /** Present when provenance is knowledge_base. */
  sourceIds?: string[];
}

// ── Lab results ─────────────────────────────────────────────────────────────

export type ResultStatus = 'low' | 'high' | 'normal' | 'critical_low' | 'critical_high' | 'unknown';

/** Status as printed on the report by the issuing lab, if any. */
export type ReportedFlag = 'L' | 'H' | 'N' | 'LL' | 'HH' | null;

export interface LabResult {
  /** Stable internal id. */
  id: string;
  /** Name exactly as printed on the report. */
  name: string;
  /** Canonical name from the terminology table, or `name` if unmapped. */
  normalizedName: string;
  /** Terminology code (e.g. LOINC) when known. */
  code: string | null;
  /** Numeric value. `null` when the report contained a non-numeric result. */
  value: number | null;
  /** Raw result text as printed, preserved for audit. */
  rawValue: string;
  /** Unit as printed, normalized where unambiguous. */
  unit: string | null;
  /** Reference interval printed on THIS user's report. Never inferred by an LLM. */
  referenceLow: number | null;
  referenceHigh: number | null;
  referenceRaw: string | null;
  /** Reference interval source: from the report, or from our reviewed table. */
  referenceSource: Provenance;
  /** Deterministically computed status. */
  status: ResultStatus;
  /** Flag the lab itself printed next to the value. */
  reportedFlag: ReportedFlag;
  /** e.g. 0.78 — 78% of the result is below the printed reference interval. */
  deviation: number | null;
  /** Free-text notes on the report (e.g. "Slightly irregular"). */
  note: string | null;
}

export type ReportType =
  | 'cbc'
  | 'cbc_with_diff'
  | 'esr'
  | 'lft'
  | 'kft'
  | 'lipid'
  | 'thyroid'
  | 'hba1c'
  | 'urinalysis'
  | 'electrolytes'
  | 'vital_signs'
  | 'unknown';

export interface ReportHeader {
  /** Test name / panel name as printed. */
  title: string;
  reportType: ReportType;
  reportTypeConfidence: number;
  reportDate: string | null;
  collectedAt: string | null;
  laboratory: string | null;
  /** Ages are needed because reference intervals are age- and sex-specific. */
  patientAgeYears: number | null;
  patientSex: 'male' | 'female' | 'other' | null;
  referringDoctor: string | null;
}

export interface ParsedReport {
  header: ReportHeader;
  results: LabResult[];
  /** Rows we could not confidently parse, kept for transparency. */
  unparsed: UnparsedLine[];
  /** Engine versions, for reproducibility. */
  pipeline: PipelineVersion;
}

export interface UnparsedLine {
  line: string;
  reason: string;
}

export interface PipelineVersion {
  parser: string;
  terminology: string;
  safety: string;
  llm?: string;
}

// ── Knowledge base ──────────────────────────────────────────────────────────

export interface MedicalSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
  /** ISO date. */
  publicationDate: string | null;
  lastReviewed: string;
  license: string;
  /** Why this source is trustworthy / what it is authorised for. */
  authorityNote: string | null;
}

export interface KnowledgePassage {
  id: string;
  conceptId: string | null;
  conceptName: string;
  title: string;
  body: string;
  readingLevel: 'plain' | 'consumer' | 'clinical';
  source: MedicalSource;
  /** Populated only when the embedding provider is configured. */
  score: number | null;
}

// ── Explanations ────────────────────────────────────────────────────────────

export interface LabExplanation {
  testName: string;
  /** "What does this test measure?" */
  whatItMeasures: string;
  /** "Why might this result be outside the reference range?" */
  whyItMayDiffer: string;
  /** "What other information may be relevant?" */
  otherRelevantInfo: string;
  sources: MedicalSource[];
  provenance: Provenance;
  /** Confidence that the explanation is well grounded. */
  grounded: boolean;
}

export interface LabAnalysis {
  header: ReportHeader;
  results: LabResult[];
  abnormal: LabResult[];
  overview: string;
  explanations: LabExplanation[];
  doctorQuestions: string[];
  safetyNotices: SafetyNotice[];
  disclaimer: string;
}

// ── Safety ──────────────────────────────────────────────────────────────────

export type SafetyLevel = 'emergency' | 'urgent' | 'soon' | 'routine' | 'unknown';
export type SafetyAction =
  | 'call_emergency_services'
  | 'emergency_department'
  | 'urgent_same_day_care'
  | 'clinician_within_24_48h'
  | 'clinician_within_1_2_weeks'
  | 'self_care_with_safety_netting'
  | 'insufficient_information';

export interface SafetyNotice {
  id: string;
  level: SafetyLevel;
  action: SafetyAction;
  title: string;
  body: string;
  /** Machine-readable triggers that caused this notice. */
  triggers: string[];
  /** Clinical rule that fired. */
  ruleId: string | null;
  ruleVersion: string | null;
  source: MedicalSource | null;
  /** When true the rest of the narrative must be suppressed, not softened. */
  suppressNarrative: boolean;
}

export interface TriageResult {
  level: SafetyLevel;
  action: SafetyAction;
  notices: SafetyNotice[];
  /** True when at least one emergency-level rule fired. */
  emergency: boolean;
  evaluatedRuleIds: string[];
  ruleSetVersion: string;
  missingInformation: string[];
}

// ── Symptoms ────────────────────────────────────────────────────────────────

export type QuestionKind =
  | 'single_choice'
  | 'multi_choice'
  | 'boolean'
  | 'number'
  | 'text'
  | 'duration'
  | 'scale';

export interface QuestionOption {
  value: string;
  label: string;
  /** Extra free text shown after selecting this option. */
  followUpPrompt?: string | null;
}

export interface SymptomQuestion {
  id: string;
  /** Stable key so answers stay linked if copy changes. */
  key: string;
  prompt: string;
  helpText: string | null;
  kind: QuestionKind;
  options: QuestionOption[];
  /** Only ask if the answer to `dependsOnKey` is in `dependsOnValues`. Empty = always. */
  dependsOnKey: string | null;
  dependsOnValues: string[];
  /** Skip if the answer to `skipIfKey` is in `skipIfValues`. */
  skipIfKey: string | null;
  skipIfValues: string[];
  /** Lower = asked first. Ties broken by id for determinism. */
  priority: number;
  /** Symptom keys this question helps disambiguate. */
  targetSymptoms: string[];
  /** True when the answer could change triage. */
  safetyCritical: boolean;
  min: number | null;
  max: number | null;
  unit: string | null;
  reviewerNote: string | null;
  version: string;
  /** Which symptom set asked this. Absent for the shared baseline bank. */
  symptomSet?: string | null;
}

// ── Symptom sets ────────────────────────────────────────────────────────────
//
// A symptom set is the reviewed, structured answer to "what do we ask about
// this problem?". Free text never generates questions directly: the classifier
// picks a set, and the set decides what is asked. That indirection is the whole
// safety argument, so the shape of a set is deliberately boring and explicit.

/**
 * How far through clinical review a piece of content is.
 *
 * Nothing ships as `approved` in this repository. Sets, questions and red flags
 * are authored to be correct and conservative, but they still require a named
 * clinician to sign them off before any real deployment.
 */
export type ReviewStatus =
  | 'draft'
  | 'in_review'
  | 'needs_clinician_review'
  | 'approved'
  | 'retired';

export interface MedicalCategory {
  /** Stable id, e.g. `respiratory.infection`. */
  id: string;
  /** Plain-language label shown to a person, e.g. "A viral chest infection". */
  label: string;
  /** Body system, used to group and de-duplicate explanations. */
  system: SymptomCategoryId;
  /**
   * One hedged sentence describing why a clinician considers this. Never a
   * statement about the reader, and never a diagnosis.
   */
  hedgedNote: string;
  /** Where the category came from, for the audit trail. */
  sourceId: string | null;
}

/** Body-system identifiers used to group symptom sets and categories. */
export type SymptomCategoryId =
  | 'general'
  | 'skin'
  | 'gastrointestinal'
  | 'respiratory'
  | 'cardiovascular'
  | 'neurological'
  | 'musculoskeletal'
  | 'urinary'
  | 'reproductive'
  | 'metabolic'
  | 'psychological'
  | 'entomological'
  | 'exposure';

/**
 * A red flag, authored as data rather than as prose buried in a prompt.
 *
 * A red flag is a *rule*: when its `when` clause matches the session, the
 * deterministic engine stops the questionnaire and shows the notice. No model
 * decides this, and a model cannot talk the engine out of it.
 */
export interface RedFlagRule {
  id: string;
  /** Set this belongs to, or `*` for a cross-cutting rule. */
  symptomSet: string;
  level: SafetyLevel;
  action: SafetyAction;
  title: string;
  body: string;
  /**
   * Which triggered the rule.
   *  - `text`    : a phrase in the free-text complaint
   *  - `answer`  : the answer to a question
   *  - `numeric` : a numeric answer outside a bound
   *  - `combo`   : several answers together
   */
  kind: 'text' | 'answer' | 'numeric' | 'combo';
  /** Phrases for a `text` rule. Matched on word boundaries, not substrings. */
  phrases?: string[];
  /** Question key for an `answer` or `numeric` rule. */
  questionKey?: string;
  /** Answer values for an `answer` rule. */
  answerValues?: string[];
  /** Numeric bounds for a `numeric` rule. */
  min?: number;
  max?: number;
  /** Answer keys that must ALL be true for a `combo` rule. */
  requires?: { key: string; value: string }[];
  /** Suppress everything below the notice. Emergency rules always do. */
  suppressNarrative: boolean;
  reviewStatus: ReviewStatus;
  version: string;
  reviewerNote: string | null;
}

export interface SymptomSet {
  /** Stable snake_case id, e.g. `cough`. Also the routing key. */
  id: string;
  /** Plain-language name shown to the person. Never a diagnosis. */
  name: string;
  version: string;
  reviewStatus: ReviewStatus;
  /** One line: what this set covers. Shown before the first question. */
  blurb: string;
  /** Body system, used for grouping. */
  system: SymptomCategoryId;
  /**
   * Words and phrases that route free text to this set. Matched on word
   * boundaries with negation handling. This is the *only* thing free text can
   * influence, and it can only ever choose a set, never a question.
   */
  keywords: string[];
  /** Phrases that veto this set even when a keyword matches. */
  excludeKeywords?: string[];
  /**
   * Sets that are also opened when this one is. "Stomach pain and vomiting"
   * must not ask abdominal questions and then make the person restate the
   * vomiting, so the two sets run together.
   */
  opensSets?: string[];
  /** Questions specific to this set. */
  questions: SymptomQuestion[];
  /** Question ids from other sets that this set also wants answered. */
  sharedQuestionIds?: string[];
  /** Deterministically evaluated. Empty means the set declares none of its own. */
  redFlags: RedFlagRule[];
  /** Reviewed, hedged explanations a clinician would consider. */
  possibleCategories: MedicalCategory[];
  /** Questions worth raising with a clinician, hedged and open-ended. */
  doctorQuestions: string[];
  /** Safety-netting: what to watch for while waiting. */
  safetyNetting: string[];
}

// ── Free-text intake ─────────────────────────────────────────────────────────

/** Why an intake was refused, so the UI can explain itself honestly. */
export type IntakeRejectionReason =
  | 'empty'
  | 'too_short'
  | 'too_long'
  | 'greeting'
  | 'not_medical'
  | 'gibberish'
  | 'question_about_the_tool'
  | 'no_symptom_found';

export type IntakeVerdict = 'accepted' | 'rejected';

export interface IntakeResult {
  verdict: IntakeVerdict;
  /** Normalised text that should be stored, or '' when rejected. */
  text: string;
  reason: IntakeRejectionReason | null;
  /** User-facing message. Never mentions internal rules. */
  message: string | null;
  /** Concrete examples shown alongside the message. */
  examples: string[];
  /** Signals found by the validator, e.g. negation, urgency words. */
  signals: string[];
}

/** How one matched symptom contributed to the classification. */
export interface ClassificationMatch {
  symptomSetId: string;
  /** The keyword that matched, as authored. */
  matched: string;
  negated: boolean;
  /** Where in the text it matched, for the audit trail. */
  index: number;
}

export interface ClassificationResult {
  /** The set whose questions lead the session. */
  primary: string | null;
  /** Every other set opened alongside the primary. */
  secondary: string[];
  /** primary + secondary, de-duplicated, in display order. */
  sets: string[];
  matches: ClassificationMatch[];
  /** 0-1. Below `ACCEPT_THRESHOLD` the intake is treated as unclear. */
  confidence: number;
  /** Plain-language duration stated in the text, e.g. "5 days". */
  statedDuration: string | null;
  /** Human-readable summary for the "we understood this as" panel. */
  summary: string;
}

export interface AnswerValue {
  questionId: string;
  questionKey: string;
  value: string | number | boolean | string[] | null;
}


export interface SymptomSession {
  id: string;
  userId: string | null;
  initialComplaint: string;
  /** Symptom sets the classifier opened for this session. */
  symptomSets: string[];
  /** The set that leads the question flow. */
  primarySymptomSet: string | null;
  /** Free-text intake verdict, stored so the decision is auditable. */
  intake: IntakeResult | null;
  classification: ClassificationResult | null;
  askedQuestionIds: string[];
  answers: AnswerValue[];
  triage: TriageResult;
  /** Deterministic red-flag evaluation, separate from the LLM path. */
  redFlags: RedFlagEvaluation | null;
  assessment: SymptomAssessment | null;
  status: 'collecting' | 'complete' | 'escalated';
  questionSetVersion: string;
  redFlagRuleVersion: string;
}

/** Result of the deterministic red-flag engine. Never model-derived. */
export interface RedFlagEvaluation {
  /** True when the questionnaire must stop immediately. */
  halt: boolean;
  notices: SafetyNotice[];
  /** Every rule that was evaluated, for the audit trail. */
  evaluatedRuleIds: string[];
  ruleSetVersion: string;
  /** When the rules last changed. */
  reviewedAt: string | null;
  reviewStatus: ReviewStatus;
}

export interface SymptomAssessment {
  summary: string;
  /** Always framed as possibilities, never as a diagnosis. */
  possibleExplanations: string[];
  why: string;
  warningSigns: string[];
  whatToDoNext: string[];
  questionsForDoctor: string[];
  redFlagScreen: string[];
  disclaimer: string;
  sources: MedicalSource[];
  /** Present when the model refused to answer for lack of information. */
  insufficientInformation: boolean;
  missingInformation: string[];
  /** Structured blocks rendered as the "your symptom summary" panel. */
  structured: StructuredSummary;
}

/**
 * The machine-readable form of the final summary.
 *
 * The prose above is written for a person; this is what a clinician-facing
 * export, a trend view, or a future consultation record would consume. It is
 * built from the stored answers only, so it can be regenerated at any time.
 */
export interface StructuredSummary {
  mainConcern: string;
  duration: string | null;
  severityNow: number | null;
  trajectory: 'better' | 'same' | 'worse' | 'unclear' | null;
  associatedSymptoms: string[];
  warningSignsIdentified: string[];
  /** True only when the red-flag engine found nothing. */
  noWarningSignsIdentified: boolean;
  answers: { question: string; answer: string }[];
}


// ── Trends ──────────────────────────────────────────────────────────────────

export interface TrendPoint {
  reportId: string;
  reportDate: string;
  testName: string;
  normalizedName: string;
  value: number;
  unit: string | null;
  status: ResultStatus;
}

export interface Trend {
  testKey: string;
  testName: string;
  unit: string | null;
  points: TrendPoint[];
  direction: 'increasing' | 'decreasing' | 'stable' | 'insufficient_data';
  /** Fractional change from first to last, e.g. 0.047 for +4.7%. */
  overallChange: number | null;
  /** How many times the value moved outside its own printed range. */
  outOfRangeCount: number;
  /** Neutral, factual statement. Never a diagnosis. */
  observation: string;
  interpretationCaveat: string;
  sufficientData: boolean;
}

// ── Doctor consultation ─────────────────────────────────────────────────────

export interface PatientSummary {
  age: number | null;
  sex: string | null;
  reportedSymptoms: string[];
  duration: string | null;
  relevantAnswers: { question: string; answer: string }[];
  uploadedReports: { title: string; date: string | null; reportType: ReportType }[];
  abnormalResults: { test: string; value: string; reference: string; status: ResultStatus }[];
  questions: string[];
  generatedAt: string;
}

// ── Uploads ─────────────────────────────────────────────────────────────────

export interface UploadedFileMeta {
  originalName: string;
  storedKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  pageCount: number;
}
