/**
 * NLM MedlinePlus web-service client.
 *
 * Source: U.S. National Library of Medicine (NLM), part of the U.S. Department of
 * Health and Human Services. MedlinePlus content is a work of the U.S. federal
 * government and is in the public domain (17 U.S.C. 105), which is why we are
 * allowed to ingest and redistribute it with attribution.
 *
 * The service is documented at
 *   https://wsearch.nlm.nih.gov/ws/query?db=<db>&term=<term>
 * and requires no API key. We use it instead of scraping web pages so that the
 * pipeline is licence-clean and reproducible.
 *
 * `db=healthTopics` returns consumer health topics with a FullSummary.
 */

export interface NlmDocument {
  rank: number;
  url: string;
  title: string;
  organizationName: string;
  fullSummary: string;
  mesh: string;
  groupNames: string[];
}

export interface NlmSearchResult {
  term: string;
  count: number;
  documents: NlmDocument[];
}

const BASE = 'https://wsearch.nlm.nih.gov/ws/query';
const ALLOWED_HOSTS = new Set([
  'medlineplus.gov',
  'www.medlineplus.gov',
  'wsearch.nlm.nih.gov',
  'vsearch.nlm.nih.gov',
]);

export function isLicensedMedlinePlusUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s+([.,;:])/g, '$1'),
  ).trim();
}

function attr(block: string, name: string): string {
  const m = new RegExp(`<content name="${name}">([\\s\\S]*?)</content>`).exec(block);
  if (!m) return '';
  const raw = decodeEntities(m[1] ?? '').trim();
  return raw.startsWith('<') ? stripTags(raw) : raw;
}

function allAttrs(block: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<content name="${name}">([\\s\\S]*?)</content>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const raw = decodeEntities(m[1] ?? '').trim();
    const v = raw.startsWith('<') ? stripTags(raw) : raw;
    if (v) out.push(v);
  }
  return out;
}

export interface SearchOptions {
  db?: 'healthTopics' | 'drugs' | 'healthTopicsInSpanish';
  retmax?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function searchHealthTopics(
  term: string,
  opts: SearchOptions = {},
): Promise<NlmSearchResult> {
  const { db = 'healthTopics', retmax = 5, timeoutMs = 20_000 } = opts;
  const url = `${BASE}?db=${encodeURIComponent(db)}&term=${encodeURIComponent(term)}&retmax=${retmax}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (opts.signal) opts.signal.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/xml', 'user-agent': 'MediSense/0.1 (+medical-info; contact via repo)' },
    });
    if (!res.ok) {
      throw new Error(`NLM search failed for "${term}": HTTP ${res.status}`);
    }
    const xml = await res.text();
    return parseSearchResult(xml, term);
  } finally {
    clearTimeout(timer);
  }
}

export function parseSearchResult(xml: string, term: string): NlmSearchResult {
  const countMatch = /<count>(-?\d+)<\/count>/.exec(xml);
  const documents: NlmDocument[] = [];
  const re = /<document\s+rank="(-?\d+)"\s+url="([^"]+)">([\s\S]*?)<\/document>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const body = m[3] ?? '';
    const url = decodeEntities(m[2] ?? '');
    // Licence gate: refuse anything that is not an NLM-operated host.
    if (!isLicensedMedlinePlusUrl(url)) continue;
    const fullSummary = attr(body, 'FullSummary');
    documents.push({
      rank: Number.parseInt(m[1] ?? '0', 10),
      url,
      title: attr(body, 'title') || attr(body, 'altTitle') || url.split('/').pop() || 'MedlinePlus topic',
      organizationName: attr(body, 'organizationName') || 'National Library of Medicine',
      fullSummary,
      mesh: attr(body, 'mesh'),
      groupNames: allAttrs(body, 'groupName'),
    });
  }
  return { term, count: countMatch ? Number.parseInt(countMatch[1] ?? '0', 10) : documents.length, documents };
}

/** Head-check that a stored citation URL is still live. */
export async function checkUrlLive(url: string, timeoutMs = 15_000): Promise<{
  url: string;
  ok: boolean;
  status: number | null;
  error: string | null;
}> {
  if (!isLicensedMedlinePlusUrl(url)) {
    return { url, ok: false, status: null, error: 'host is not a licensed NLM/MedlinePlus host' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'MediSense/0.1 (citation verification)' },
    });
    return { url, ok: res.ok, status: res.status, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return { url, ok: false, status: null, error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
