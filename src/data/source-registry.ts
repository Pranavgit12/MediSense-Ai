/**
 * Source registry and licensing gate.
 *
 * The product must never explain a medical fact without a traceable, lawfully
 * usable source. This module is the enforcement point:
 *
 *   - every source declares a `qualityTier` and a licence
 *   - `assertRedistributable()` throws unless a source is licensed AND
 *     permits redistribution
 *   - the ingestion pipeline calls it for every document it ingests
 *
 * If a source cannot be legally redistributed, the pipeline stores only the
 * citation metadata (title, URL, publisher) so a user can read it themselves,
 * and never copies the text into the knowledge base.
 */

export type SourceQualityTier =
  /** Textbook / professional reference. Not free to redistribute. */
  | 'professional_reference'
  /** Peer-reviewed journal, guideline, or government clinical guideline. */
  | 'peer_reviewed_or_guideline'
  /** Government consumer health information. */
  | 'government_consumer_health'
  /** Open-access peer-reviewed article under a permissive licence. */
  | 'open_access_peer_reviewed'
  /** Terminology / vocabulary service. */
  | 'terminology_standard';

export interface SourceQuality {
  qualityTier: SourceQualityTier;
  peerReviewed: boolean;
  clinicalReviewByPublisher: boolean;
  redistributionAllowed: boolean;
  notes: string;
}

export interface SourceRecord {
  slug: string;
  title: string;
  publisher: string;
  url: string;
  license: string;
  licenseUrl: string | null;
  quality: SourceQuality;
  /** Who last confirmed the source is still reachable and still licensed. */
  lastReviewed: string;
  lastReviewedBy: string;
  /** Only reviewed sources may back a user-facing clinical statement. */
  reviewStatus: 'approved' | 'draft' | 'retired';
}

export class SourceLicenceError extends Error {
  readonly sourceSlug: string;
  constructor(slug: string, reason: string) {
    super(`Source "${slug}" cannot be used: ${reason}`);
    this.name = 'SourceLicenceError';
    this.sourceSlug = slug;
  }
}

const MEDLINEPLUS_LICENSE_URL = 'https://medlineplus.gov/about/developers/websiteapi.html';

/** Sources that back user-facing clinical statements in this build. */
export const SOURCE_REGISTRY: SourceRecord[] = [
  {
    slug: 'medlineplus-nlm',
    title: 'MedlinePlus health topics',
    publisher: 'U.S. National Library of Medicine (NLM), National Institutes of Health',
    url: 'https://medlineplus.gov/',
    license: 'Public domain (work of the U.S. federal government)',
    licenseUrl: MEDLINEPLUS_LICENSE_URL,
    quality: {
      qualityTier: 'government_consumer_health',
      peerReviewed: false,
      clinicalReviewByPublisher: true,
      redistributionAllowed: true,
      notes:
        'Written and medically reviewed by NLM. Consumer education material, not clinical decision support. Public domain, so we may ingest and quote it with attribution.',
    },
    lastReviewed: '2026-09-26',
    lastReviewedBy: 'MediSense content review (automated URL + licence check)',
    reviewStatus: 'approved',
  },
  {
    slug: 'nlm-web-service',
    title: 'NLM Web Service (healthTopics database)',
    publisher: 'U.S. National Library of Medicine',
    url: 'https://wsearch.nlm.nih.gov/ws/query',
    license: 'Public domain (work of the U.S. federal government)',
    licenseUrl: MEDLINEPLUS_LICENSE_URL,
    quality: {
      qualityTier: 'government_consumer_health',
      peerReviewed: false,
      clinicalReviewByPublisher: true,
      redistributionAllowed: true,
      notes: 'Documented public API used for reproducible ingestion instead of page scraping.',
    },
    lastReviewed: '2026-09-26',
    lastReviewedBy: 'MediSense content review',
    reviewStatus: 'approved',
  },
  {
    slug: 'loinc',
    title: 'LOINC (Logical Observation Identifiers Names and Codes)',
    publisher: 'Regenstrief Institute, Indiana University School of Medicine',
    url: 'https://loinc.org/',
    license: 'Free to use; LOINC content is copyrighted and NOT open licence. Attribution required. Code distributions must retain the LOINC licence notice.',
    licenseUrl: 'https://loinc.org/license/',
    quality: {
      qualityTier: 'terminology_standard',
      peerReviewed: false,
      clinicalReviewByPublisher: true,
      redistributionAllowed: false,
      notes:
        'We store LOINC codes as identifiers only. We do not ingest LOINC definitions or long common names into the knowledge base, because LOINC is not openly licensed for redistribution. Codes are verified against the NLM terminology service before being shown to users.',
    },
    lastReviewed: '2026-09-26',
    lastReviewedBy: 'MediSense content review',
    reviewStatus: 'approved',
  },
];

const BY_SLUG = new Map(SOURCE_REGISTRY.map((s) => [s.slug, s]));

export function getSource(slug: string): SourceRecord | null {
  return BY_SLUG.get(slug) ?? null;
}

/**
 * Gate a source before its text may enter the knowledge base.
 * Throws `SourceLicenceError` when the source is not cleared for use.
 */
export function assertRedistributable(slug: string, source: Pick<SourceQuality, 'redistributionAllowed' | 'qualityTier'>): void {
  const record = getSource(slug);
  if (!record) throw new SourceLicenceError(slug, 'source is not in the registry');
  if (record.reviewStatus !== 'approved') {
    throw new SourceLicenceError(slug, `source review status is "${record.reviewStatus}", not "approved"`);
  }
  if (!source.redistributionAllowed || !record.quality.redistributionAllowed) {
    throw new SourceLicenceError(
      slug,
      'licence does not permit redistribution; store the citation only and do not copy the text',
    );
  }
}

/** A source may back an explanation only if it is cleared for that use. */
export function canBackExplanation(slug: string): boolean {
  const s = getSource(slug);
  if (!s || s.reviewStatus !== 'approved') return false;
  return s.quality.qualityTier !== 'terminology_standard';
}

export interface IntakeDecision {
  action: 'ingest_text' | 'cite_only' | 'reject';
  reason: string;
}

/**
 * Decide what to do with a candidate document found by the harvester.
 * `cite_only` means: keep the citation so the user can read the source, but do
 * not copy its text into our retrievable knowledge base.
 */
export function intakeDecision(slug: string, documentUrl: string): IntakeDecision {
  const s = getSource(slug);
  if (!s) return { action: 'reject', reason: 'source is not in the registry' };
  if (s.reviewStatus !== 'approved') {
    return { action: 'reject', reason: `source review status is "${s.reviewStatus}"` };
  }
  if (!isAllowedDocumentUrl(documentUrl)) {
    return { action: 'reject', reason: 'document URL host is not on the licence allow-list' };
  }
  if (!s.quality.redistributionAllowed) {
    return { action: 'cite_only', reason: `licence forbids redistribution: ${s.license}` };
  }
  return { action: 'ingest_text', reason: `cleared for use under: ${s.license}` };
}

const ALLOWED_DOC_HOSTS = new Set(['medlineplus.gov', 'www.medlineplus.gov']);

export function isAllowedDocumentUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_DOC_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}
