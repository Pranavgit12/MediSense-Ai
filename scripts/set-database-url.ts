/**
 * `npm run db:configure`
 *
 * Writes DATABASE_URL into .env.local, then verifies the connection.
 *
 * This exists because the database password has to come from the Supabase
 * dashboard, and every other way of getting it into a file is worse: typing it
 * into a config file puts it in an editor's undo history, passing it as a
 * command argument puts it in shell history, and pasting it into a chat puts it
 * on a server. Here it is read with the terminal in raw mode, so it is never
 * echoed, never echoed into a log, and never leaves the machine.
 *
 * It is also why the verification runs here rather than being left as a manual
 * follow-up step: a connection string that looks right but cannot connect is
 * the failure mode worth catching immediately, and this reports it precisely
 * instead of leaving someone to guess from a migration error.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ENV_PATH = '.env.local';

/**
 * Read a line with echo disabled.
 *
 * Raw mode is required to suppress echoing; there is no supported way to hide
 * input without taking the terminal out of line mode, which means handling
 * backspace and Ctrl-C by hand.
 */
function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin as NodeJS.ReadStream & {
      isRaw?: boolean;
      setRawMode?: (mode: boolean) => void;
    };
    if (!stdin.isTTY || !stdin.setRawMode) {
      reject(
        new Error(
          'This prompt needs an interactive terminal.\n' +
            'Run it directly in your shell rather than through a pipe or a task runner.',
        ),
      );
      return;
    }

    const wasRaw = stdin.isRaw;
    let value = '';
    process.stdout.write(prompt);

    const cleanup = (): void => {
      stdin.setRawMode!(wasRaw ?? false);
      stdin.pause();
      stdin.removeListener('data', onData);
    };

    function onData(chunk: Buffer): void {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          cleanup();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          // Ctrl-C: abort without writing anything.
          cleanup();
          process.stdout.write('\n');
          reject(new Error('Cancelled. Nothing was written.'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (ch >= ' ') {
          value += ch;
        }
      }
    }

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

/** Replace one `KEY=` line, or append it if absent. */
function setEnvValue(contents: string, key: string, value: string): string {
  const lines = contents.split(/\r?\n/);
  const pattern = new RegExp(`^${key}=`);
  const index = lines.findIndex((l) => pattern.test(l));

  if (index >= 0) lines[index] = `${key}=${value}`;
  else {
    // Keep the trailing newline behaviour predictable: append at the end.
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    lines.push(`${key}=${value}`, '');
  }
  return lines.join('\n');
}

function runCheck(): Promise<number> {
  return new Promise((resolve) => {
    // Inherits stdio so the check output appears immediately.
    const child = spawn(
      process.execPath,
      ['--env-file-if-exists=.env.local', '--import', 'tsx', 'scripts/db-check.ts'],
      { stdio: 'inherit' },
    );
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function main(): Promise<void> {
  if (!existsSync(ENV_PATH)) {
    throw new Error('.env.local not found. Copy .env.example to .env.local first.');
  }

  const host =
    process.argv[2]?.trim() ||
    'db.iejafqdtxefouqkfkbgz.supabase.co:5432/postgres';

  console.log('Supabase database setup');
  console.log('');
  console.log('Find the password in Supabase under:');
  console.log('  Project Settings -> Database -> Connection string -> URI');
  console.log('Click the reveal icon first; the default view shows [YOUR-PASSWORD].');
  console.log('');
  console.log('The password will not be echoed and is never written to a log.');
  console.log('');

  const password = await askHidden('Database password: ');
  if (!password) {
    console.log('No password entered. Nothing was written.');
    return;
  }

  // A Supabase password may contain @ : / ? # or %. Left unencoded, any of
  // those would silently truncate or reparse the connection string, producing
  // an authentication failure that looks like a wrong password.
  const url = `postgresql://postgres:${encodeURIComponent(password)}@${host}`;
  const updated = setEnvValue(readFileSync(ENV_PATH, 'utf8'), 'DATABASE_URL', url);
  writeFileSync(ENV_PATH, updated);

  console.log('DATABASE_URL written to .env.local (value not displayed).');
  console.log('');
  console.log('Checking the connection...');
  console.log('');

  const code = await runCheck();
  if (code !== 0) {
    console.log('');
    console.log('The connection did not succeed, so no migration was attempted.');
    console.log('Fix the password in the Supabase dashboard and run this again.');
    process.exitCode = code;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
