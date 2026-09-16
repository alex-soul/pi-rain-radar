import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

export async function createRadarSettings(directory, { onEvent = () => {} } = {}) {
  const folder = join(directory, 'settings');
  const file = join(folder, 'radar.json');
  await mkdir(folder, { recursive: true, mode: 0o700 });
  let waitForSettle = true, busy = false;
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    if (typeof saved.waitForSettle !== 'boolean') throw new Error();
    waitForSettle = saved.waitForSettle;
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Stored radar settings are invalid. Restore settings/radar.json before starting.');
  }
  return {
    current: () => ({ waitForSettle }),
    waitForSettle: () => waitForSettle,
    async configure(input) {
      if (typeof input?.waitForSettle !== 'boolean') return { status: 400, error: 'Choose whether to wait for radar to settle.' };
      if (busy) return { status: 409, error: 'Radar settings are being saved. Please try again.' };
      busy = true;
      try {
        await writeFile(`${file}.tmp`, JSON.stringify({ waitForSettle: input.waitForSettle }), { mode: 0o600 });
        await rename(`${file}.tmp`, file);
        const changed = waitForSettle !== input.waitForSettle;
        waitForSettle = input.waitForSettle;
        if (changed) onEvent(waitForSettle ? 'settling-on' : 'settling-off');
        return { status: 200, waitForSettle };
      } finally { busy = false; }
    },
  };
}
