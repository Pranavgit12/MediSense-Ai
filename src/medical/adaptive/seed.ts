/**
 * Seeding known facts from the opening free text.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * The rule this file exists to satisfy: do not ask a question whose answer the
 * user has already given.
 *
 * A user who types "I've had a cough for three days and it brings up yellow
 * phlegm" has answered the cough duration and the cough type. Asking either
 * again is not a harmless formality — it is the single most common way a
 * questionnaire loses someone's trust, and it is trivially avoidable because
 * the answer is sitting in the text.
 *
 * The parse is deliberately narrow and deterministic. It reads a small closed
 * set of facts the intake text can state unambiguously, and it refuses to guess:
 * anything it is not confident about is left unseeded so the question is still
 * asked. A missed seed costs one question; a wrong seed costs correctness and
 * safety, because a wrong seed can suppress a red-flag screen.
 *
 * Negation is handled. "I don't have a fever" must not seed a fever.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { PatientSex, Topic } from './types';
import type { SeededFacts } from './profile';
import { SEX_WORDS } from './profile';
import { NODE_BY_KEY } from './nodes';

const NEGATION =
  /\b(no|not|never|without|haven'?t|hasn'?t|hadn'?t|don'?t|doesn'?t|didn'?t|deny|denies|none|free\s+of)\b/;

/** True when a negation word governs this clause, with no boundary in between. */
function isNegated(text: string, index: number): boolean {
  const window = text.slice(Math.max(0, index - 40), index);
  // A clause boundary means the negation applies to something else, e.g.
  // "no fever, but a bad headache".
  const afterBoundary = window.split(/[,;.]|\bbut\b|\bhowever\b/).pop() ?? '';
  return NEGATION.test(afterBoundary);
}

// ── Duration ─────────────────────────────────────────────────────────────────

/**
 * Duration phrases, longest unit first so "3 weeks" is never read as "3".
 *
 * Each maps to the authored option value used by the duration questions, so a
 * seeded answer is directly comparable with a clicked one and the branch
 * conditions downstream behave identically either way.
 */
const DURATION_PHRASES: { pattern: RegExp; value: string }[] = [
  { pattern: /\b(?:for|since|about|around|roughly)?\s*(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:or|to|-)?\s*(?:few\s*)?(hour|hours)\b/, value: 'lt_1d' },
  { pattern: /\b(?:for|since|about|around|roughly)?\s*(?:less than\s*|under\s*|a\s*)?(day|today|tonight)\b/, value: 'lt_1d' },
  { pattern: /\b(?:for|since|about|around|roughly)?\s*(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:or|to|-)?\s*(day|days)\b/, value: 'd1_3' },
  { pattern: /\b(?:for|since|about|around|roughly)?\s*(four|five|six|seven|4|5|6|7)\s*(?:or|to|-)?\s*(day|days)\b/, value: 'd4_7' },
  { pattern: /\b(?:for|since|about|around|roughly)?\s*(one|two|three|1|2|3)\s*(?:or|to|-)?\s*(week|weeks)\b/, value: 'd1_3w' },
  { pattern: /\b(?:for|since|about|around|roughly)?\s*(four|five|six|seven|eight|nine|ten|4|5|6|7|8|9|10)\s*(?:or|to|-)?\s*(week|weeks)\b/, value: 'gt_3w' },
  { pattern: /\b(?:for|since|about|around|roughly)?\s*(\d+|a|an|one|two|three|1|2|3)\s*(?:or|to|-)?\s*(month|months)\b/, value: 'gt_3w' },
  { pattern: /\b(?:for|since)\s*(a\s*)?(few|several|couple)\s*(day|days|week|weeks)\b/, value: 'd1_3w' },
  { pattern: /\b(for|since)\s*(months|years|a long time|ages)\b/, value: 'gt_3w' },
];

/**
 * Reduce a numeric phrase to the duration bucket.
 *
 * Handled separately from the regex above because the same unit maps to
 * different buckets depending on the count: "5 days" and "2 days" are both
 * "days" but fall on opposite sides of the 3/4-day boundary.
 *
 * Every count must land in exactly one bucket. An earlier version had a gap
 * between 7 and 21 days, which sent "10 days" to `gt_3w` — greater than three
 * weeks. That is wrong twice over: it is not what the patient said, and it is the
 * value a prolonged-fever rule reads, so it inflates a real escalation.
 */
function bucketFor(count: number, unit: string): string | null {
  if (unit.startsWith('hour')) return count < 24 ? 'lt_1d' : 'd1_3';
  if (unit.startsWith('day')) {
    if (count < 2) return 'lt_1d';
    if (count <= 3) return 'd1_3';
    if (count <= 7) return 'd4_7';
    // 8 to 20 days is between one and three weeks.
    if (count <= 20) return 'd1_3w';
    return 'gt_3w';
  }
  if (unit.startsWith('week')) {
    if (count < 2) return 'd1_3w';
    if (count <= 3) return 'd1_3w';
    return 'gt_3w';
  }
  if (unit.startsWith('month')) return 'gt_3w';
  if (unit.startsWith('year')) return 'gt_3w';
  return null;
}

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, couple: 2, few: 3, several: 3,
};

function toNumber(token: string): number | null {
  if (/^\d+$/.test(token)) return Number(token);
  return WORD_NUMBERS[token.toLowerCase()] ?? null;
}

/**
 * Which symptom a stated duration attaches to.
 *
 * Looked for within the same clause as the duration phrase, so "my cough has
 * been going three days but my back has hurt for a month" attributes correctly
 * instead of blanket-covering every duration topic.
 *
* `key` is the question the seed answers. Where a symptom set has no duration
 * question of its own the entry is `null`: the topic is still recorded, because
 * the timeline is the useful fact, but nothing is asserted against a question
 * that does not exist.
 */
const DURATION_TOPIC_BY_SYMPTOM: { pattern: RegExp; topic: Topic; key: string | null }[] = [
  { pattern: /\b(cough|coughing|phlegm|sputum|chesty)\b/, topic: 'duration.cough', key: 'cough_duration' },
  { pattern: /\b(fever|temperature|feverish|pyrexia|chills|shivering)\b/, topic: 'duration.fever', key: 'fever_duration' },
  { pattern: /\b(headache|head pain|migraine)\b/, topic: 'duration.headache', key: 'headache_duration' },
  { pattern: /\b(stomach|belly|abdomen|tummy|abdominal)\b/, topic: 'duration.abdominal', key: null },
  { pattern: /\b(throat|sore throat)\b/, topic: 'duration.sore_throat', key: 'throat_duration' },
  { pattern: /\b(vomit|vomiting|being sick)\b/, topic: 'duration.vomiting', key: 'vomit_duration' },
  { pattern: /\b(diarrh?oea|loose motion|loose stool)\b/, topic: 'duration.diarrhoea', key: 'diarrhoea_duration' },
  { pattern: /\b(rash|skin|itch)\b/, topic: 'duration.skin', key: null },
  { pattern: /\b(dizz|vertigo)\b/, topic: 'duration.dizziness', key: 'dizzy_duration' },
  { pattern: /\b(chest)\b/, topic: 'duration.chest', key: null },
  { pattern: /\b(breath|breathing|breathless)\b/, topic: 'duration.breath', key: null },
  { pattern: /\b(back)\b/, topic: 'duration.back', key: 'back_duration' },
  { pattern: /\b(joint|joints|shoulder|knee|hip)\b/, topic: 'duration.joint', key: 'joint_duration' },
  { pattern: /\b(urine|urinating|peeing|burning urine)\b/, topic: 'duration.urinary', key: 'urinary_duration' },
  { pattern: /\b(tired|tiredness|fatigue|exhausted|energy)\b/, topic: 'duration.fatigue', key: 'fatigue_duration' },
];

function clauseAround(text: string, index: number): string {
  const start = Math.max(0, text.lastIndexOf(',', index - 1) + 1);
  const comma = text.indexOf(',', index);
  const end = comma === -1 ? text.length : comma;
  return text.slice(start, end);
}

/**
 * Pull durations out of the opening text.
 *
 * Returns a topic and question key per distinct symptom so the caller can mark
 * both the topic as covered and the implied answer as given. A duration stated
 * with no recognisable symptom still seeds the generic topic, because "it has
 * been going on for three days" is a real answer to "how long has this been".
 */
function seedDurations(
  text: string,
  impliedAnswers: Record<string, string>,
  topics: Set<Topic>,
  matched: string[],
): void {
  for (const { pattern, value } of DURATION_PHRASES) {
    const m = pattern.exec(text);
    if (!m) continue;
    if (isNegated(text, m.index)) continue;

    // Prefer an explicit count so "5 days" and "2 days" land in different buckets.
    let bucket = value;
    const count = m[1] ? toNumber(m[1]) : null;
    const unit = (m[2] ?? m[1] ?? '').toString();
    if (count !== null && unit) {
      const precise = bucketFor(count, unit);
      if (precise) bucket = precise;
    }

    const clause = clauseAround(text, m.index);
    const owner = DURATION_TOPIC_BY_SYMPTOM.find((entry) => entry.pattern.test(clause));
    const topic = owner?.topic ?? 'duration.generic';
    if (topics.has(topic)) continue;
    topics.add(topic);
    // Some symptom sets have no duration question of their own, so there is no
    // key to seed. The topic is still worth recording: it is the timeline fact,
    // and later branches can reason about it even though nothing was asked.
    if (owner?.key) impliedAnswers[owner.key] = bucket;
    matched.push(`duration:${topic}=${bucket}`);
  }
}

// ── Nature of the complaint ──────────────────────────────────────────────────

/**
 * Cough type, which the spec calls out directly: someone who says "I have a
 * cough" should be asked about dry versus productive, never whether they have a
 * cough.
 */
/**
 * Facts the opening text can state unambiguously.
 *
 * `answer` is only set where the value is a *known-valid* option of the question
 * it seeds. Where the option vocabulary is not ours to assume, only the topic is
 * seeded, which suppresses a duplicate question without inventing an answer the
 * user never gave. Seeding an invalid value would fail validation later; seeding
 * a wrong one — calling a reported rash "no rash" — would be worse than either.
 */
// The "cannot" phrasing matters and is easy to lose.
//
// A seed pattern written as `can'?t` matches "cant" and "can't" but not
// "cannot" — which is the phrasing people actually type when they are frightened
// and typing one-handed. Those are exactly the phrases that must not be missed,
// so every negated-capability pattern below spells the forms out. Keeping "cannot"
// in a shared alternation rather than as one more alternative in a single pattern
// is deliberate: it stops the gap reappearing one phrase at a time.

const NATURE_SEEDS: {
  pattern: RegExp;
  key: string;
  answer: string | null;
  topic: Topic;
  label: string;
}[] = [
  { pattern: /\b(dry cough|cough(ing)?\s+(?:with no|without)\s+(?:phlegm|mucus)|no phlegm|non[- ]?productive)\b/, key: 'cough_type', answer: 'dry', topic: 'nature.cough', label: 'dry cough' },
  { pattern: /\b(productive cough|coughing up (?:phlegm|mucus|sputum)|bringing up (?:phlegm|mucus)|with phlegm|with mucus|wet cough|chesty cough)\b/, key: 'cough_type', answer: 'mucus', topic: 'nature.cough', label: 'cough with mucus' },
  { pattern: /\b(coughing up blood|blood[- ]streaked (?:mucus|phlegm)|coughed up blood)\b/, key: 'cough_blood', answer: 'more', topic: 'red_flag.cough_blood', label: 'blood in sputum' },
  // Topic only, and deliberately no `high_fever: yes`. Saying "I have a fever"
  // establishes that a temperature is present, which closes the nine duplicate
  // per-set fever screens — but it does not establish that the temperature is
  // *high*, and asserting that would both overstate the severity and suppress the
  // question that would actually find out.
  { pattern: /\b(fever|temperature|feeling hot|pyrexia|high temperature|feverish)\b/, key: '', answer: null, topic: 'red_flag.fever_present', label: 'fever' },
  // Topic only. "I have a cold" names a syndrome, not which of the cold features
  // is present, and the feature question is the one worth asking.
  { pattern: /\b(running nose|runny nose|blocked nose|congestion|congested|catarrh|blocked sinuses|have a cold|catching a cold)\b/, key: '', answer: null, topic: 'nature.cold', label: 'cold symptoms' },
  { pattern: /\b((?:can'?t|cannot|can not) breathe|struggling to breathe|short of breath|breathless|difficulty breathing|laboured breathing|gasping)\b/, key: 'breathlessness', answer: 'yes', topic: 'red_flag.breathlessness', label: 'breathlessness' },
  { pattern: /\b(chest pain|tight chest|chest tightness|pressure in my chest|pain in my chest)\b/, key: 'chest_pain', answer: 'yes', topic: 'red_flag.chest_pain', label: 'chest pain' },
  { pattern: /\b(black|tarry|bloody)\s*(stool|bowel movement)\b|\bblood in my stool\b|\bbloody stool\b/, key: 'abdo_blood', answer: 'yes', topic: 'red_flag.bleeding', label: 'blood in stool' },
  { pattern: /\b(vomiting blood|coughing up blood|blood in my vomit|throwing up blood)\b/, key: 'vomit_blood', answer: 'yes', topic: 'red_flag.bleeding', label: 'blood in vomit' },
  { pattern: /\b(fainted|blacked out|passed out|lost consciousness|collapsed)\b/, key: 'altered_sensorium', answer: 'yes', topic: 'red_flag.altered_sensorium', label: 'loss of consciousness' },
  { pattern: /\b(confused|confusion|disoriented|unusually drowsy|hard to wake|drowsy|drowsy and)\b/, key: 'altered_sensorium', answer: 'yes', topic: 'red_flag.altered_sensorium', label: 'confusion or drowsiness' },
  { pattern: /\b(stiff neck|neck stiffness|neck is stiff)\b/, key: 'stiff_neck', answer: 'yes', topic: 'red_flag.stiff_neck', label: 'stiff neck' },
  { pattern: /\b(anaphylaxis|anaphylactic|severe allergic reaction|throat closing|throat is closing|face (?:is )?swelling|my lips (?:are )?swelling|tongue swelling|swollen tongue|lips are puffy)\b/, key: 'severe_allergic_reaction', answer: 'yes', topic: 'red_flag.severe_allergic_reaction', label: 'severe allergic reaction' },
  // Two seeds rather than one, because "cannot keep fluids down" and "passing very
  // little urine" are different answers to the same question. Collapsing them
  // into a yes/no would have meant inventing an option that does not exist.
  { pattern: /\b((?:can'?t|cannot|can not|unable to) keep (?:any )?(?:food|liquid|fluids|liquids) down|throwing everything up|completely dehydrated)\b/, key: 'dehydration_signs', answer: 'cannot_keep_down', topic: 'red_flag.dehydration', label: 'cannot keep fluids down' },
  { pattern: /\b(passing (?:very )?little urine|not passing urine|no urine for)\b/, key: 'dehydration_signs', answer: 'not_passing', topic: 'red_flag.dehydration', label: 'passing very little urine' },
  { pattern: /\b(yellow(?:ing)? (?:eyes|skin)|jaundice|eyes look yellow|skin looks yellow)\b/, key: 'yellowing_of_eyes', answer: 'yes', topic: 'red_flag.jaundice', label: 'yellowing of eyes' },
  { pattern: /\b(weakness (?:down|on) one side|one side of my (?:body|face) (?:is )?(?:weak|numb)|slurred speech|(?:can'?t|cannot|can not) speak properly|my face has dropped)\b/, key: 'weakness_of_one_body_side', answer: 'yes', topic: 'red_flag.stroke', label: 'one-sided weakness' },
  // Topic only. Saying "I have a rash" does not answer whether it fades when
  // pressed, which is the question that matters, so nothing is implied here.
  { pattern: /\b(rash|red spots|hives|itchy skin)\b/, key: '', answer: null, topic: 'nature.skin', label: 'rash' },
  { pattern: /\b(stomach|belly|tummy|abdomen)\s+(?:pain|cramp|ache|cramping|hurts?|hurting)\b|\babdominal pain\b|\bstomach ache\b/, key: '', answer: null, topic: 'nature.abdominal', label: 'abdominal pain' },
  { pattern: /\b(throwing up|vomiting|been sick|feel sick|nausea)\b/, key: '', answer: null, topic: 'nature.vomiting', label: 'vomiting' },
  { pattern: /\b(loose (?:stool|motion)|diarrh?oea)\b/, key: '', answer: null, topic: 'nature.diarrhoea', label: 'diarrhoea' },
  { pattern: /\b(taking|on|been taking) (?:paracetamol|acetaminophen|ibuprofen|aspirin|naproxen|antibiotics?|amoxicillin|panadol|tylenol)\b/, key: 'medication_taken_now', answer: 'yes', topic: 'context.medication_now', label: 'already taking a medicine' },
];

/**
 * Is this a value the question could actually have returned?
 *
 * The seeder is the one place allowed to write an answer the patient never
 * typed, so it is also the one place that can put an impossible value into the
 * answer map. A `cold_features` answer of `yes` against a question whose only
 * options are `runny_nose|sneezing|sore_throat|mild_body_ache|none` is not a
 * harmless mistake: it silently closes a topic that was never actually
 * established, and it would be rejected by `validateAnswer` if it ever came back
 * through the form.
 *
 * So every implied answer is checked against the live question before it is
 * stored, and an illegal one is dropped rather than trusted. Dropping costs one
 * question later; keeping it costs correctness, and on a safety screen it costs
 * more than that.
 *
 * Free-text kinds (`text`, `number`, `scale`) are not checked: the seeder does not
 * write those, and there is no option list to check them against.
 */
function isLegalAnswer(key: string, value: string): boolean {
  const node = NODE_BY_KEY.get(key);
  if (!node) return false;

  const kind = node.question.kind;
  if (kind === 'text' || kind === 'number' || kind === 'scale') return true;
  if (!('options' in node.question) || !Array.isArray(node.question.options)) return false;

  return node.question.options.some((option) => option.value === value);
}

function seedNature(
  text: string,
  impliedAnswers: Record<string, string>,
  topics: Set<Topic>,
  matched: string[],
): void {
  for (const seed of NATURE_SEEDS) {
    const m = seed.pattern.exec(text);
    if (!m) continue;
    if (isNegated(text, m.index)) continue;
    topics.add(seed.topic);
    matched.push(seed.label);
    // Only seed an answer when the value is a known-valid option. Topic-only
    // seeds suppress the duplicate question without asserting anything.
    if (seed.key && seed.answer !== null && impliedAnswers[seed.key] === undefined) {
      if (isLegalAnswer(seed.key, seed.answer)) {
        impliedAnswers[seed.key] = seed.answer;
      }
      // Illegal value: the topic is still recorded, so the duplicate question is
      // still suppressed, but nothing false is asserted about the answer.
    }
  }
}

// ── Age and sex ──────────────────────────────────────────────────────────────

const AGE_PATTERNS = [
  /\b(?:i am|i'm|im|aged)\s*(\d{1,3})\s*(?:years old|yrs old|yo)?\b/,
  /\b(\d{1,3})\s*(?:years old|yrs old|year old|yo)\b/,
  /\bage[d]?\s+(\d{1,3})\b/,
];

function seedAge(text: string): number | null {
  for (const pattern of AGE_PATTERNS) {
    const m = pattern.exec(text);
    if (!m) continue;
    const age = Number(m[1]);
    if (Number.isFinite(age) && age >= 0 && age <= 130) return age;
  }
  return null;
}

function seedSex(text: string): PatientSex {
  for (const { sex, pattern } of SEX_WORDS) {
    if (pattern.test(text)) return sex;
  }
  return null;
}

/**
 * Trajectory and severity, which are otherwise two separate scale questions.
 *
 * "It's getting worse" is an unambiguous answer to the trajectory question, and
 * it is a safety-relevant one, so it is worth catching in the opening text.
 */
function seedTrajectory(
  text: string,
  impliedAnswers: Record<string, string>,
  topics: Set<Topic>,
  matched: string[],
): void {
  const patterns: { pattern: RegExp; value: string; label: string }[] = [
    { pattern: /\b(getting worse|is worse|has got worse|getting worse and worse|deteriorat\w+|rapidly worsening)\b/, value: 'worse', label: 'getting worse' },
    { pattern: /\b(getting better|improving|is better|has improved|getting better and better)\b/, value: 'better', label: 'getting better' },
    { pattern: /\b(about the same|unchanged|staying the same|no change|hasn't changed|has not changed|stable)\b/, value: 'same', label: 'about the same' },
  ];
  for (const { pattern, value, label } of patterns) {
    const m = pattern.exec(text);
    if (!m) continue;
    if (isNegated(text, m.index)) continue;
    if (impliedAnswers.trajectory !== undefined) continue;
    impliedAnswers.trajectory = value;
    topics.add('trajectory.generic');
    matched.push(label);
    return;
  }
}

/**
 * Extract every fact the opening text states unambiguously.
 *
 * Callers merge `impliedAnswers` into the answer map for the purposes of branch
 * conditions while keeping them out of the stored answers, so a seeded fact is
 * never recorded as something the user was asked and clicked.
 */
export function seedFromText(text: string): SeededFacts {
  const lowered = text.toLowerCase().trim();
  const impliedAnswers: Record<string, string> = {};
  const topics = new Set<Topic>();
  const matched: string[] = [];

  if (!lowered) {
    return { topics: [], impliedAnswers, ageYears: null, sex: null, matched };
  }

  seedNature(lowered, impliedAnswers, topics, matched);
  seedDurations(lowered, impliedAnswers, topics, matched);
  seedTrajectory(lowered, impliedAnswers, topics, matched);

  // "I'm on X for it" answers the medication question without anyone asking.
  if (
    impliedAnswers.medication_taken_now === undefined &&
    /(?:i(?:'m| am)\s+(?:currently\s+)?(?:on|taking)|been taking)\s+(?:some\s+)?[a-z]/.test(lowered) &&
    !/\b(?:not|never|stopped)\b[^.]{0,20}$/.test(lowered.slice(0, lowered.indexOf('taking') + 8))
  ) {
    impliedAnswers.medication_taken_now = 'yes';
    topics.add('context.medication_now');
    matched.push('already taking a medicine');
  }

  const ageYears = seedAge(lowered);
  const sex = seedSex(lowered);

  return {
    topics: [...topics],
    impliedAnswers,
    ageYears,
    sex,
    matched,
  };
}

/**
 * Topics satisfied by having answered *any* question that collects the same
 * information.
 *
 * `duration.fever` also covers `duration.generic`: once we know how long the
 * fever has lasted, "how long have you had this problem?" has been answered.
 * Without this the engine would ask a generic duration after a specific one,
 * which is precisely the repetition the spec forbids.
 */
export function narrowTopics(topic: Topic): Topic[] {
  const [facet] = topic.split('.');
  return facet ? [facet, topic] : [topic];
}
