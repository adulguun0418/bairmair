// Sets the SMS spike alert's Edge Function secrets from supabase/.env:
//   RESEND_API_KEY      Resend API key (re_...), required
//   SMS_ALERT_EMAIL     where alerts go (with Resend's onboarding@resend.dev sender, the address
//                       the Resend account was made with), required
//   SMS_ALERT_PER_HOUR  codes per hour that trigger an alert, optional (default 15)
//   SMS_ALERT_FROM      sender, optional (default "bairmair <onboarding@resend.dev>")
//
// Only these names are sent (supabase/.env also holds Auth secrets the function must not get).
// They go through a temporary env file under supabase/.temp/ (gitignored), removed afterwards,
// so the values never appear on a command line. The function reads them at its next start.
//
// Usage: node supabase/scripts/alert-secrets.mjs [--yes]
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const supabaseDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED = ['RESEND_API_KEY', 'SMS_ALERT_EMAIL'];
const OPTIONAL = ['SMS_ALERT_PER_HOUR', 'SMS_ALERT_FROM'];

const values = {};
for (const line of readFileSync(join(supabaseDir, '.env'), 'utf8')
  .replace(/^\uFEFF/, '')
  .split(/\r?\n/)) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if (match) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
}

const missing = REQUIRED.filter((name) => !values[name]);
if (missing.length > 0) {
  console.error(`supabase/.env: set ${missing.join(' and ')} first (see .env.example).`);
  process.exit(2);
}

const names = [...REQUIRED, ...OPTIONAL.filter((name) => values[name])];
const tempDir = join(supabaseDir, '.temp');
const envFile = join(tempDir, 'alert-secrets.env');
mkdirSync(tempDir, { recursive: true });
writeFileSync(envFile, names.map((name) => `${name}=${values[name]}`).join('\n') + '\n');
try {
  const result = spawnSync(
    'pnpm',
    ['exec', 'supabase', 'secrets', 'set', '--env-file', envFile, ...process.argv.slice(2)],
    { cwd: join(supabaseDir, '..'), stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (result.status === 0) console.log(`Set ${names.join(', ')}.`);
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(envFile, { force: true });
}
