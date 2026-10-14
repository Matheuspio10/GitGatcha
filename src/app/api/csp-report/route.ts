import { enforceRateLimit } from '@/lib/rateLimit';
import { parseCspReports } from '@/lib/securityHeaders';

/** Bigger reports are dropped unread (a real one is under 2 KB). */
const MAX_REPORT_BYTES = 16 * 1024;

/**
 * Receives what the Content Security Policy would block (report-uri and the
 * Reporting API both post here) and logs one "[CSP]" line per violation, for
 * the Vercel logs. Always answers 204: browsers ignore the response.
 */
export async function POST(req: Request) {
  const limited = await enforceRateLimit(req, 'csp-report', 30, 60);
  if (limited) return new Response(null, { status: 204 });

  const text = await req.text().catch(() => '');
  if (!text || text.length > MAX_REPORT_BYTES) return new Response(null, { status: 204 });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 204 });
  }
  for (const v of parseCspReports(body)) {
    console.warn(`[CSP] ${v.directive} blocked ${v.blocked || '(inline)'} on ${v.page}${v.source ? ` (${v.source})` : ''}`);
  }
  return new Response(null, { status: 204 });
}
