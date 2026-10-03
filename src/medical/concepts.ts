/**
 * Curated, plain-language explanations of each supported test.
 *
 * This is the *grounding* layer. Two hard rules:
 *
 *  1. Every sentence is hedged. These describe why a number *may* move, never
 *     what a person's result means, and never name a diagnosis as a conclusion.
 *  2. These strings are inputs to a language model, not a substitute for it. The
 *     model rewrites them for the reader; it may not add anything that is not
 *     here plus the numbers extracted from the user's own report.
 *
 * Keyed on the canonical names in `src/medical/terminology.ts`.
 */
import { PROVENANCE, type LabExplanation, type Provenance } from '../types/medical';

export interface TestConcept {
  /** Canonical test name, matching terminology.ts. */
  name: string;
  /** "What does this test measure?" */
  whatItMeasures: string;
  /** "Why might a result be outside the range?" */
  whyItMayDiffer: string;
  /** "What else is worth knowing?" */
  otherRelevantInfo: string;
  /** Common next step a clinician might take, phrased without diagnosing. */
  typicalNextStep: string;
}

export const TEST_CONCEPTS: TestConcept[] = [
  {
    name: 'Hemoglobin',
    whatItMeasures:
      'Hemoglobin is the protein inside red blood cells that carries oxygen around your body. This test measures how much of it is in your blood.',
    whyItMayDiffer:
      'A low level is one common way blood is described as "anemic". Common reasons include not having enough iron, recent blood loss, and some long-term illnesses. A high level is often temporary and can come from being dehydrated, living at altitude, or certain heart and lung conditions.',
    otherRelevantInfo:
      'Haemoglobin is usually read together with the red cell count, the haematocrit, and the cell size, because those give the fuller picture. Iron status is usually checked separately.',
    typicalNextStep:
      'A clinician commonly checks ferritin and other iron studies, and asks about diet and any recent bleeding.',
  },
  {
    name: 'Red Blood Cell Count',
    whatItMeasures:
      'This counts how many red blood cells are in a set volume of your blood.',
    whyItMayDiffer:
      'It moves together with haemoglobin. A lower count often goes with a low haemoglobin, and the same things that affect one affect the other. A higher count can follow dehydration, or a stay at high altitude.',
    otherRelevantInfo:
      'The count is less useful on its own, which is why it is almost always reported next to haemoglobin and the haematocrit.',
    typicalNextStep:
      'Usually interpreted as part of a group rather than looked at alone.',
  },
  {
    name: 'White Blood Cell Count',
    whatItMeasures:
      'White blood cells are part of the immune system. This test counts how many are in a set volume of your blood.',
    whyItMayDiffer:
      'A higher count commonly happens when the body is fighting an infection, or during inflammation anywhere in the body. It can also rise with certain medicines or with physical and emotional stress. A lower count can follow some viral infections, some medicines, and less commonly conditions affecting the bone marrow.',
    otherRelevantInfo:
      'A white cell count on its own says very little. The *types* of white cell, given as a differential, usually say more about what is happening.',
    typicalNextStep:
      'A clinician usually looks at which types of white cell changed, and whether the change matches the symptoms.',
  },
  {
    name: 'Platelet Count',
    whatItMeasures:
      'Platelets are small cell fragments that help your blood clot. This test counts how many are in your blood.',
    whyItMayDiffer:
      'A lower count can mean the body is making fewer platelets, or using them up faster, and may lead to bruising or bleeding more easily. Common causes include some medicines, a viral illness, and conditions affecting the bone marrow or immune system. A higher count can happen with inflammation, smoking, and, when sustained, may raise the risk of clots.',
    otherRelevantInfo:
      'This result matters alongside the bleeding history a clinician takes from you, not only on its own.',
    typicalNextStep:
      'An unexpected result is often repeated, and the trend over time is more useful than a single number.',
  },
  {
    name: 'Hematocrit',
    whatItMeasures:
      'The haematocrit is the percentage of your blood volume made up of red blood cells. The rest is mostly plasma.',
    whyItMayDiffer:
      'It follows haemoglobin closely. It is lower in many of the same situations that lower haemoglobin, and higher in many of the situations that raise it, including dehydration.',
    otherRelevantInfo:
      'The lab may report this as "PCV" (packed cell volume), which is the same measurement.',
    typicalNextStep:
      'Read together with haemoglobin and the red cell count.',
  },
  {
    name: 'MCV',
    whatItMeasures:
      'The mean corpuscular volume is the average size of one red blood cell.',
    whyItMayDiffer:
      'Smaller cells are commonly seen with iron deficiency and sometimes with chronic illness. Larger cells can come from low vitamin B12 or folate, from alcohol, and from certain medicines.',
    otherRelevantInfo:
      'This is often the most useful single clue in a full blood count, because it describes the *shape* of the problem rather than just the amount.',
    typicalNextStep:
      'A clinician commonly follows up with iron, B12 and folate tests depending on which direction it moved.',
  },
  {
    name: 'MCH',
    whatItMeasures:
      'The mean corpuscular haemoglobin is the average amount of haemoglobin carried by one red blood cell.',
    whyItMayDiffer:
      'It is low in the same situations that make cells small, most often iron deficiency. It is high in the same situations that make cells large.',
    otherRelevantInfo:
      'It is a calculated value that supports the cell-size measurement rather than being interpreted alone.',
    typicalNextStep: 'Interpreted alongside MCV and MCHC.',
  },
  {
    name: 'MCHC',
    whatItMeasures:
      'The mean corpuscular haemoglobin concentration is how concentrated the haemoglobin is inside the cells.',
    whyItMayDiffer:
      'A slightly low value commonly accompanies iron deficiency. A noticeably high value is more often caused by the sample sitting too long, being warmed, or being handled roughly before analysis.',
    otherRelevantInfo:
      'It does not usually change much on its own, so a change here more often points to how the sample was handled than to a health issue.',
    typicalNextStep: 'Often no action beyond repeating the test in better conditions.',
  },
  {
    name: 'RDW',
    whatItMeasures:
      'The red cell distribution width measures how much the red cells vary in size.',
    whyItMayDiffer:
      'A higher value means a mix of small and large cells. It commonly appears while an iron deficiency is developing, and while someone is recovering from one after treatment starts. It also rises with some vitamin deficiencies and after certain blood transfusions.',
    otherRelevantInfo:
      'It is most useful as a trend. A rising value after starting iron treatment often means the treatment is working.',
    typicalNextStep: 'Usually compared with previous results rather than read in isolation.',
  },
  {
    name: 'Neutrophils',
    whatItMeasures:
      'Neutrophils are the white cells that respond first to bacterial infection. This test measures how many are in your blood.',
    whyItMayDiffer:
      'A higher count commonly points to a bacterial infection or to inflammation elsewhere in the body. Some medicines, such as steroids, also raise it. A lower count can follow some medicines, some viral illnesses, and less commonly conditions affecting the bone marrow.',
    otherRelevantInfo:
      'This is normally the largest group of white cells, so a change in the total is often driven by a change in neutrophils.',
    typicalNextStep: 'Interpreted together with the total white cell count and the symptoms.',
  },
  {
    name: 'Lymphocytes',
    whatItMeasures:
      'Lymphocytes are white cells involved in fighting viruses and regulating the immune system.',
    whyItMayDiffer:
      'They often rise during and after viral infections, and can stay raised for some time afterwards. They can fall with steroid medicines, with some other medicines, and with certain infections and conditions.',
    otherRelevantInfo:
      'Lymphocytes are usually reported as a percentage as well as an absolute number, and the absolute number is the more reliable of the two.',
    typicalNextStep: 'A clinician may recheck after a few weeks to see whether the pattern has settled.',
  },
  {
    name: 'Monocytes',
    whatItMeasures: 'Monocytes are larger white cells that clear up debris and help coordinate inflammation.',
    whyItMayDiffer:
      'They can rise with some longer-lasting infections and inflammatory conditions, and they sometimes rise briefly while the body is recovering from an infection.',
    otherRelevantInfo: 'They are normally a small proportion of the white cells.',
    typicalNextStep: 'A single raised value is often rechecked.',
  },
  {
    name: 'Eosinophils',
    whatItMeasures: 'Eosinophils are white cells involved in allergic reactions and in responding to parasites.',
    whyItMayDiffer:
      'A higher count is commonly linked to allergies, hay fever, asthma, eczema, and some parasite infections. It can also rise with some medicines.',
    otherRelevantInfo:
      'It is a common finding in people with asthma and is not usually a concern on its own.',
    typicalNextStep: 'Usually interpreted alongside allergy history and any new medicines.',
  },
  {
    name: 'Basophils',
    whatItMeasures: 'Basophils are a small group of white cells that release substances involved in allergic and inflammatory responses.',
    whyItMayDiffer: 'They can rise with some allergic conditions, some thyroid conditions, and a few others.',
    otherRelevantInfo: 'They are normally a very small proportion of the white cell count.',
    typicalNextStep: 'Rarely needs follow-up on its own.',
  },
  {
    name: 'ESR',
    whatItMeasures:
      'The erythrocyte sedimentation rate measures how quickly red cells settle in a tube of blood. It rises when anything in the body is inflamed.',
    whyItMayDiffer:
      'It is a general marker of inflammation rather than a specific one, so a raised result can come from many different places at once: an infection, an injury, arthritis, or other inflammatory conditions. It also tends to rise with age, and with anaemia.',
    otherRelevantInfo:
      'Because it is not specific, a raised ESR points to something happening but not to what or where. It pairs with CRP when that is available.',
    typicalNextStep: 'Usually used to support a clinical picture rather than to make one.',
  },
  {
    name: 'HbA1c',
    whatItMeasures:
      'This test estimates your average blood sugar over roughly the last two to three months, based on how much glucose has stuck to your haemoglobin.',
    whyItMayDiffer:
      'A higher result means average blood sugar has been higher than the target range over those months. A lower result can follow recent blood loss, pregnancy, a recent blood transfusion, or some conditions affecting red cells, because the result depends on haemoglobin.',
    otherRelevantInfo:
      'It reflects an average over months, so it cannot show a sudden change, and it is not affected by the day or the meal you last ate.',
    typicalNextStep:
      'It is usually repeated after roughly three months to see whether a change in treatment has taken effect.',
  },
  {
    name: 'Fasting Glucose',
    whatItMeasures:
      'This measures the amount of glucose in your blood after you have not eaten for about 8 to 12 hours.',
    whyItMayDiffer:
      'A higher result can reflect what you have eaten in the preceding days, reduced physical activity, and can be the first sign of raised blood sugar over time. Stress, illness and some medicines also raise it. A lower result is less common and can follow prolonged fasting, certain medicines, or a low carbohydrate intake.',
    otherRelevantInfo:
      'The fasting requirement is what makes this different from a random glucose test, and the two are not interchangeable.',
    typicalNextStep:
      'A single raised result is normally repeated or confirmed with HbA1c before anything is concluded.',
  },
  {
    name: 'Total Cholesterol',
    whatItMeasures: 'This adds up the different kinds of cholesterol carried in your blood.',
    whyItMayDiffer: 'It is affected by what you eat, your weight and activity, your genetics, and how well your thyroid is working.',
    otherRelevantInfo: 'On its own it is less informative than the separate parts, which are reported below.',
    typicalNextStep: 'Read as a group, alongside LDL, HDL and triglycerides.',
  },
  {
    name: 'LDL Cholesterol',
    whatItMeasures:
      'Sometimes called "bad" cholesterol. LDL carries cholesterol from the liver to the tissues, and when there is more than the arteries can handle, it can build up inside them.',
    whyItMayDiffer: 'It rises with diets high in saturated fat, with weight gain and inactivity, and with genetics. It is also affected by thyroid function.',
    otherRelevantInfo:
      'Risk is usually judged over years rather than from one reading, and it combines with blood pressure, smoking, diabetes and family history.',
    typicalNextStep: 'A clinician looks at the overall pattern, not a single LDL number in isolation.',
  },
  {
    name: 'HDL Cholesterol',
    whatItMeasures:
      'Sometimes called "good" cholesterol. HDL carries cholesterol away from the tissues back towards the liver.',
    whyItMayDiffer:
      'It tends to be higher with regular aerobic activity, and lower with smoking, being overweight, and some metabolic conditions.',
    otherRelevantInfo:
      'Once a level is reasonably high, exercise tends not to add much more. Drugs that raise it have not been shown to improve outcomes.',
    typicalNextStep: 'A marker of overall cardiovascular risk rather than something treated directly.',
  },
  {
    name: 'Triglycerides',
    whatItMeasures: 'Triglycerides are a type of fat in the blood, largely derived from carbohydrates and alcohol in the diet.',
    whyItMayDiffer:
      'They rise with a high intake of refined carbohydrates and alcohol, with weight gain, with poorly controlled diabetes, and with some inherited conditions.',
    otherRelevantInfo:
      'Very high levels are relevant because they can affect the pancreas. Levels that are mildly raised are common and often change with diet and activity.',
    typicalNextStep: 'Diet, alcohol intake, activity and blood sugar control are usually addressed first.',
  },
  {
    name: 'ALT',
    whatItMeasures: 'ALT is an enzyme found mainly in the liver. This test measures how much is in your blood.',
    whyItMayDiffer:
      'A raised level means liver cells are irritated. Common causes include alcohol, some medicines and supplements, and a build-up of fat in the liver. Viral infections and other liver conditions can also raise it.',
    otherRelevantInfo: 'ALT often rises before any symptoms are noticed, which is why it is part of routine blood tests.',
    typicalNextStep: 'A clinician usually repeats it and reviews alcohol, medicines, weight and blood pressure.',
  },
  {
    name: 'AST',
    whatItMeasures: 'AST is an enzyme found in the liver and in other tissues, including the heart and muscles.',
    whyItMayDiffer:
      'Like ALT, it is raised by alcohol, medicines and liver conditions. Because it is also in muscle and heart tissue, a raised result can follow heavy physical activity, muscle injury, or heart problems as well.',
    otherRelevantInfo:
      'ALT and AST are normally read as a pair. A result is easier to interpret when both are given.',
    typicalNextStep: 'Read together with ALT, and alongside an account of alcohol intake and medicines.',
  },
  {
    name: 'Bilirubin Total',
    whatItMeasures:
      'Bilirubin is a yellow pigment made when the body breaks down old red blood cells. This test measures the total in your blood.',
    whyItMayDiffer:
      'A raised level can come from red cells being broken down faster than usual, or from the liver not clearing bilirubin as efficiently. Gilbert\'s syndrome, a common and harmless inherited variant, makes levels rise mildly and is not a disease.',
    otherRelevantInfo:
      'If the skin or eyes look yellow, that is a separate thing to mention to a clinician straight away.',
    typicalNextStep: 'A mild, isolated rise with otherwise normal results is often rechecked rather than acted on.',
  },
  {
    name: 'Creatinine',
    whatItMeasures:
      'Creatinine is a waste product made by muscle and filtered out by the kidneys. This test measures how much is in your blood.',
    whyItMayDiffer:
      'A raised level usually means the kidneys are filtering less well than expected. It is also raised by eating cooked meat in the 24 hours beforehand, by creatine supplements, and by heavier muscle mass. A low level is more often down to lower muscle mass than to anything about the kidneys.',
    otherRelevantInfo:
      'It is usually reported alongside an estimated filtration rate, and the combination describes kidney function better than either alone.',
    typicalNextStep: 'A persistent rise is usually rechecked and read alongside the filtration rate and urine findings.',
  },
  {
    name: 'Urea',
    whatItMeasures: 'Urea is a waste product made when the body breaks down protein. It is filtered by the kidneys and measured in the blood.',
    whyItMayDiffer:
      'A raised level can mean reduced kidney function, but it also rises with dehydration, a high protein intake, and some medicines. A low level is not usually a concern.',
    otherRelevantInfo: 'Together with creatinine it gives a fuller picture, and the two sometimes move differently.',
    typicalNextStep: 'Hydration status and protein intake are usually considered before interpreting it.',
  },
  {
    name: 'Sodium',
    whatItMeasures:
      'Sodium is the main salt in the body, and together with potassium it controls the balance of fluid inside and outside your cells.',
    whyItMayDiffer:
      'A low level is commonly caused by drinking a large amount of water in a short time, by some medicines such as diuretics, and by vomiting or diarrhoea. A high level usually comes from losing fluid through sweating, vomiting or diarrhoea, and less commonly from kidney or heart conditions.',
    otherRelevantInfo: 'A significant change in either direction can affect how a person feels, and low sodium is often the more noticeable of the two.',
    typicalNextStep: 'An unexpected result is normally rechecked and read alongside potassium and kidney function.',
  },
  {
    name: 'Potassium',
    whatItMeasures:
      'Potassium works with sodium to control fluid balance, and it is essential for the heart and muscles to function normally.',
    whyItMayDiffer:
      'A low level commonly follows vomiting or diarrhoea, and can be caused by diuretics and some other medicines. A high level is less common and can relate to kidney function, to certain medicines, and to a condition affecting the adrenal glands.',
    otherRelevantInfo:
      'Both a low and a high potassium can affect the heart rhythm, which is why an unexpected result is usually treated as more pressing than other results on this panel.',
    typicalNextStep:
      'A significantly abnormal result is normally acted on quickly, and often confirmed with a repeat sample.',
  },
  {
    name: 'TSH',
    whatItMeasures:
      'TSH is a hormone released by the pituitary gland that tells the thyroid how much hormone to make.',
    whyItMayDiffer:
      'A raised TSH most often means the thyroid is working slowly, because the gland is being asked to work harder. A low TSH most often means the thyroid is working faster than it should. Both can also be affected by illness elsewhere, by medicines, and by pregnancy.',
    otherRelevantInfo: 'TSH is the main screening test for thyroid function and is rarely interpreted without free T4.',
    typicalNextStep: 'If the level is only slightly outside range, a repeat test is often arranged before anything else.',
  },
  {
    name: 'Free T4',
    whatItMeasures: 'Free T4 is the main active thyroid hormone that is not bound to proteins in the blood.',
    whyItMayDiffer:
      'A raised level most often accompanies an overactive thyroid, and a low level an underactive one. Levels also shift during illness and are affected by some medicines.',
    otherRelevantInfo: 'Free T4 and TSH move in opposite directions, which is why they are read as a pair.',
    typicalNextStep: 'Interpreted together with TSH.',
  },
];

const BY_NAME = new Map(TEST_CONCEPTS.map((c) => [c.name.toLowerCase(), c]));

export function findConcept(canonicalName: string): TestConcept | null {
  return BY_NAME.get(canonicalName.trim().toLowerCase()) ?? null;
}

/**
 * Deterministic explanation for one result. This is the guaranteed-available
 * text: it is also what the language model is given, so it must stand on its own.
 *
 * A test with no reviewed concept returns an honest "we don't know" rather than
 * a guess, and `grounded: false` so the UI can flag it.
 */
export function explainDeterministically(testName: string): LabExplanation {
  const concept = findConcept(testName);
  const provenance: Provenance = PROVENANCE.KNOWLEDGE_BASE;

  if (!concept) {
    return {
      testName,
      whatItMeasures: `This report lists ${testName}, which is not in our reviewed explanation library yet.`,
      whyItMayDiffer:
        'We do not yet have a reviewed explanation for this test, so we are not going to guess at one. The value and the reference range printed on your report are shown as-is above.',
      otherRelevantInfo: 'A clinician can explain what this test measures and what the range means for you.',
      sources: [],
      provenance,
      grounded: false,
    };
  }

  return {
    testName,
    whatItMeasures: concept.whatItMeasures,
    whyItMayDiffer: concept.whyItMayDiffer,
    otherRelevantInfo: concept.otherRelevantInfo,
    sources: [],
    provenance,
    grounded: true,
  };
}

/** Test names we have a reviewed explanation for. Used by the UI to show coverage. */
export function conceptCoverage(names: string[]): { covered: number; total: number } {
  return { covered: names.filter((n) => findConcept(n) !== null).length, total: names.length };
}
