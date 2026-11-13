// Runs `supabase config diff|push` with extra test OTP numbers from supabase/.env.
//
// Real phones must not appear in config.toml (the repo is public: a fixed code would let
// anyone sign in as that number). DEV_TEST_OTP="97699112233=123456,..." in supabase/.env is
// merged into [auth.sms.test_otp] of a temporary copy under supabase/.temp/ (gitignored),
// and the CLI runs against that copy with --workdir. config push sends the whole map, so a
// plain `supabase config push` would drop these numbers again.
//
// Usage: node supabase/scripts/auth-config.mjs diff|push [extra CLI flags]
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const supabaseDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const [command, ...flags] = process.argv.slice(2);
if (command !== 'diff' && command !== 'push') {
  console.error('Usage: auth-config.mjs diff|push [flags]');
  process.exit(2);
}

/** Reads one variable from supabase/.env without exporting the others. */
function readEnvVar(name) {
  let text;
  try {
    text = readFileSync(join(supabaseDir, '.env'), 'utf8');
  } catch {
    return undefined;
  }
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match?.[1] === name) return match[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return undefined;
}

const entries = (readEnvVar('DEV_TEST_OTP') ?? '')
  .split(',')
  .map((pair) => pair.trim())
  .filter(Boolean)
  .map((pair) => {
    const match = /^\+?(\d{8,15})=(\d{6})$/.exec(pair);
    if (!match) {
      console.error(`DEV_TEST_OTP: expected "phone=6-digit code", got "${pair}"`);
      process.exit(2);
    }
    return { phone: match[1], code: match[2] };
  });

const config = readFileSync(join(supabaseDir, 'config.toml'), 'utf8');
const header = '[auth.sms.test_otp]';
const at = config.indexOf(header);
if (at === -1) {
  console.error(`config.toml has no ${header} table`);
  process.exit(2);
}
const insertAt = at + header.length;
const extra = entries
  .filter(({ phone }) => !new RegExp(`^"?${phone}"?\\s*=`, 'm').test(config))
  .map(({ phone, code }) => `\n${phone} = "${code}"`)
  .join('');

// The CLI expects <workdir>/supabase/{config.toml,.env,.temp}.
const workdir = join(supabaseDir, '.temp', 'auth-config');
const target = join(workdir, 'supabase');
rmSync(workdir, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
writeFileSync(
  join(target, 'config.toml'),
  config.slice(0, insertAt) + extra + config.slice(insertAt),
);
cpSync(join(supabaseDir, '.env'), join(target, '.env'));
// Link state (project ref, versions): the plain files of supabase/.temp, not this copy.
mkdirSync(join(target, '.temp'));
for (const entry of readdirSync(join(supabaseDir, '.temp'), { withFileTypes: true })) {
  if (entry.isFile()) {
    cpSync(join(supabaseDir, '.temp', entry.name), join(target, '.temp', entry.name));
  }
}

console.error(`Extra test numbers from supabase/.env: ${entries.length}`);
const result = spawnSync(
  'supabase',
  ['config', command, '--workdir', workdir, ...flags, '--remote'],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);
rmSync(workdir, { recursive: true, force: true });
process.exit(result.status ?? 1);
