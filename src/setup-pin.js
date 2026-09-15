import { emitKeypressEvents } from 'node:readline';
import { setPin, disablePin, createSettingsAuth } from './settings-auth.js';

const args = process.argv.slice(2);
const action = args[0] || '--set';
const usage = `Settings PIN recovery (run from the app's repository folder):
  docker compose exec radar node src/setup-pin.js           Set/reset and enable a PIN
  docker compose exec radar node src/setup-pin.js --set     Same as the original command
  docker compose exec radar node src/setup-pin.js --reset   Choose a replacement PIN
  docker compose exec radar node src/setup-pin.js --enable  Choose a PIN and enable protection
  docker compose exec radar node src/setup-pin.js --disable Disable protection; remove the PIN
  docker compose exec radar node src/setup-pin.js --status  Show whether protection is enabled

Set/reset/enable prompt twice with hidden input. Never put the PIN in a command.
No existing PIN is needed. Other settings, API keys and radar data are preserved.
Changes take effect without a restart. Close and reopen browser settings afterward.
An existing failed-attempt delay can last up to five minutes after setting a PIN.`;
if (args.length > 1 || !['--set', '--reset', '--enable', '--disable', '--status', '--help'].includes(action)) {
  console.error(usage); process.exit(1);
}
if (action === '--help') { console.log(usage); process.exit(0); }
const directory = process.env.DATA_DIR || '/data';
if (action === '--disable' || action === '--status') {
  try {
    if (action === '--disable') {
      await disablePin(directory);
      console.log('PIN protection disabled. Other settings and data are unchanged. Close and reopen browser settings.');
    } else console.log(`PIN protection is ${await createSettingsAuth(directory).configured() ? 'enabled' : 'disabled'}.`);
  } catch { console.error('PIN recovery unavailable. Check the data directory and its permissions.'); process.exitCode = 1; }
  process.exit(process.exitCode || 0);
}

if (!process.stdin.isTTY) {
  console.error('Run interactively: docker compose exec radar node src/setup-pin.js');
  process.exit(1);
}
emitKeypressEvents(process.stdin);
async function prompt(label) {
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    function done(error) {
      process.stdin.off('keypress', keypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      error ? reject(error) : resolve(value);
    }
    function keypress(text, key) {
      if (key?.ctrl && key.name === 'c') return done(new Error('Cancelled.'));
      if (key?.name === 'return') return done();
      if (key?.name === 'backspace') { value = value.slice(0, -1); return; }
      if (/^\d$/.test(text || '') && value.length < 6) value += text;
    }
    process.stdin.on('keypress', keypress);
  });
}
try {
  console.log('Choose a six-digit settings PIN. Input is hidden. This also resets an existing PIN.');
  const pin = await prompt('New PIN: ');
  const confirmation = await prompt('Confirm PIN: ');
  if (pin !== confirmation) throw new Error('PINs do not match. Nothing changed.');
  await setPin(directory, pin);
  console.log('Settings PIN saved. Existing sessions are invalidated; no restart needed.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
