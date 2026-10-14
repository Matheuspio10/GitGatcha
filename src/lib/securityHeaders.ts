/**
 * Security headers sent with every response (wired in next.config.ts; pure and
 * unit tested, so it imports nothing).
 *
 * The Content Security Policy starts in REPORT-ONLY mode: browsers report what
 * it would block to /api/csp-report (logged as "[CSP]") and block nothing. Once
 * the logs stay clean, switch CSP_ENFORCED to true.
 *
 * Scripts and styles still need 'unsafe-inline': Next.js inlines its bootstrap
 * scripts, and the game uses style attributes everywhere (framer-motion, card
 * colours). Removing it would take per-request nonces (dynamic rendering of every page).
 */

export const CSP_ENFORCED = false;
export const CSP_REPORT_PATH = '/api/csp-report';

/** Where images come from: card avatars (GitHub), Google sign-in pictures, uploads as data: URLs. */
const IMAGE_HOSTS = [
  'https://avatars.githubusercontent.com',
  'https://github.com', // github.com/<login>.png, which redirects to avatars.githubusercontent.com
  'https://*.googleusercontent.com',
];

/** Sign-in forms post to our /api/auth, which redirects to the provider: form-action covers the redirect. */
const SIGN_IN_HOSTS = ['https://github.com', 'https://accounts.google.com'];

export function contentSecurityPolicy({ dev }: { dev: boolean }): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // Dev: React Refresh needs eval
    'script-src': ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', ...IMAGE_HOSTS],
    'font-src': ["'self'", 'data:'],
    // Dev: the HMR websocket
    'connect-src': ["'self'", ...(dev ? ['ws:', 'wss:'] : [])],
    'media-src': ["'self'", 'data:', 'blob:'],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'", ...SIGN_IN_HOSTS],
    'frame-ancestors': ["'none'"],
    // report-uri only: when report-to is also set, Chrome switches to the Reporting API, which batches
    // reports for up to a minute and that some embedded browsers never deliver
    'report-uri': [CSP_REPORT_PATH],
  };
  return Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}

export function securityHeaders({ dev }: { dev: boolean }): { key: string; value: string }[] {
  return [
    { key: CSP_ENFORCED ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', value: contentSecurityPolicy({ dev }) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // The game is never meant to be framed (clickjacking); CSP frame-ancestors says the same to newer browsers
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // Holo tilt reads the device orientation (accelerometer/gyroscope), so those stay allowed for the site itself
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    ...(dev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]),
  ];
}

/** One line per violation for the logs, from either report format (report-uri JSON or the Reporting API). */
export interface CspViolation {
  directive: string;
  blocked: string;
  page: string;
  source?: string;
}

function str(value: unknown, max = 300): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

export function parseCspReports(body: unknown): CspViolation[] {
  const items: unknown[] = Array.isArray(body) ? body : [body];
  const out: CspViolation[] = [];
  for (const item of items.slice(0, 20)) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    // report-uri: { "csp-report": { "violated-directive": … } }; Reporting API: [{ type: "csp-violation", body: { effectiveDirective: … } }]
    const legacy = record['csp-report'] as Record<string, unknown> | undefined;
    const modern = record.type === 'csp-violation' ? (record.body as Record<string, unknown> | undefined) : undefined;
    if (legacy && typeof legacy === 'object') {
      out.push({
        directive: str(legacy['effective-directive']) || str(legacy['violated-directive']),
        blocked: str(legacy['blocked-uri']),
        page: str(legacy['document-uri']),
        source: str(legacy['source-file']) || undefined,
      });
    } else if (modern && typeof modern === 'object') {
      out.push({
        directive: str(modern.effectiveDirective),
        blocked: str(modern.blockedURL),
        page: str(modern.documentURL),
        source: str(modern.sourceFile) || undefined,
      });
    }
  }
  return out.filter(v => v.directive);
}
