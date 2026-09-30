// Runs alignments off the main thread so the UI stays responsive.
import { runAlignment } from '../core/align';
import type { SeqRecord } from '../core/seq';
import type { AlignSettings } from '../core/types';

interface Req {
  id: number;
  records: SeqRecord[];
  settings: AlignSettings;
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, records, settings } = e.data;
  try {
    let last = 0;
    const alignment = runAlignment(records, settings, (stage, fraction) => {
      const now = performance.now();
      if (now - last > 80 || fraction >= 1) {
        last = now;
        self.postMessage({ id, type: 'progress', stage, fraction });
      }
    });
    self.postMessage({ id, type: 'result', alignment });
  } catch (err) {
    const e = err as Error & { key?: string; args?: (string | number)[] };
    self.postMessage({ id, type: 'error', message: e.message ?? String(err), key: e.key, args: e.args });
  }
};
