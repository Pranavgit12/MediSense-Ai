/**
 * Pinned-page fetcher for MedlinePlus content that the `healthTopics` search
 * database does not index (the /lab-tests/ pages).
 *
 * This is deliberately NOT a general web scraper:
 *   - the URL list is a pinned, reviewed set in `src/data/harvest-spec.ts`
 *   - only `medlineplus.gov` over HTTPS is allowed
 *   - the page <title> must contain one of the reviewed keywords
 *   - only the main content region is extracted; nav, header, footer and
 *     scripts are discarded
 *   - every extracted citation keeps publisher, URL, licence and review date
 *
 * The licence gate in `src/data/source-registry.ts` is applied by the caller.
 */
import { isLicensedMedlinePlusUrl } from './nlm';

export interface PinnedPage {
  url: string;
  title: string;
  h1: string;
  text: string;
  sections: { heading: string; body: string }[];
  httpStatus: number;
}

const UA = 'Mozilla/5.0 (compatible; MediSense/0.1; medical-information; +https://example.invalid/medisense)';

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number.parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(Number.parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"');
}

/** Remove script/style/nav/header/footer/aside blocks before text extraction. */
function stripChrome(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

/**
 * Isolate the main article body.
 *
 * `<article>` is preferred because it is explicitly bounded, which makes the
 * extraction immune to whatever MedlinePlus puts in the surrounding chrome.
 * `id="mplus-content"` is the fallback for pages without an article element.
 */
function extractMainRegion(html: string): string {
  const article = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  if (article?.[1] && article[1].length > 200) return article[1];

  const patterns = [
    /<div[^>]*\bid="mplus-content"[^>]*>([\s\S]*)/i,
    /<div[^>]*\bclass="[^"]*\bmplus-content\b[^"]*"[^>]*>([\s\S]*)/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]*\bid="main"[^>]*>([\s\S]*)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) return m[1];
  }
  return html;
}

/**
 * Drop the trailing chrome that follows the article body.
 *
 * Inside MedlinePlus `<article>` the order is:
 *   page-info (h1) -> main/mp-content (the real text) -> mp-refs (references)
 *   -> aside (a "more lab test articles" link list) -> lt-disclaimer
 *
 * Only the link list is noise, so that is the only structural cut. The
 * `mp-refs` block is deliberately kept: it carries the page's own citations.
 */
function cutTail(html: string): string {
  const cut = html.search(/<aside\b|<footer\b|<div[^>]*\bclass="[^"]*\bbottom\b[^"]*"/i);
  return cut > 0 ? html.slice(0, cut) : html;
}

function htmlToText(html: string): string {
  return decode(
    html
      .replace(/<\/(p|div|li|tr|h[1-6]|section|article|br)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    // MedlinePlus wraps glossary terms in <a>, which leaves a space before the
    // following punctuation: "liver injury , certain". Repair it.
    .replace(/ +([,.;:!?%])/g, '$1')
    .replace(/ +\n/g, '\n')
    .replace(/\n +/g, '\n')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractSections(html: string): { heading: string; body: string }[] {
  const out: { heading: string; body: string }[] = [];
  const re = /<h([23])[^>]*>([\s\S]*?)<\/h\1>([\s\S]*?)(?=<h[23][^>]*>|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const heading = htmlToText(m[2] ?? '');
    const body = htmlToText(cutTail(stripChrome(m[3] ?? '')));
    if (heading && body.length > 60) out.push({ heading, body });
    if (out.length >= 30) break;
  }
  return out;
}

export async function fetchPinnedPage(url: string, timeoutMs = 30_000): Promise<PinnedPage> {
  if (!isLicensedMedlinePlusUrl(url)) {
    throw new Error(`refusing to fetch non-NLM URL: ${url}`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let html = '';
  let httpStatus = 0;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html' },
    });
    httpStatus = res.status;
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').trim();
  const h1 = decode(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? '').trim();

  const region = stripChrome(extractMainRegion(html));
  const cleaned = cutTail(region);
  const text = htmlToText(cleaned);
  const sections = extractSections(cutTail(region));

  return { url, title, h1, text, sections, httpStatus };
}

/** Title guard used by the harvester. */
export function pinnedTitleMatches(url: string, title: string, keywords: string[]): boolean {
  const t = `${title} ${url}`.toLowerCase();
  return keywords.some((k) => t.includes(k.toLowerCase()));
}
