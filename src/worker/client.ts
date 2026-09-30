// Promise wrapper around the alignment worker, with a main-thread fallback.
import { runAlignment } from '../core/align';
import type { SeqRecord } from '../core/seq';
import type { Alignment, AlignSettings, ProgressFn } from '../core/types';
import AlignWorker from './align.worker?worker&inline';

let worker: Worker | null = null;
let seq = 0;
let current: { id: number; reject: (e: Error) => void } | null = null;
let workerBroken = false;

function getWorker(): Worker | null {
  if (worker) return worker;
  if (workerBroken) return null;
  try {
    worker = new AlignWorker();
  } catch {
    worker = null;
  }
  return worker;
}

/** Run an alignment. A newer call cancels (terminates) the previous one. */
export function align(records: SeqRecord[], settings: AlignSettings, onProgress?: ProgressFn): Promise<Alignment> {
  if (current) {
    current.reject(new Error('cancelled'));
    worker?.terminate();
    worker = null;
    current = null;
  }
  const w = getWorker();
  if (!w) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          resolve(runAlignment(records, settings, onProgress));
        } catch (e) {
          reject(e as Error);
        }
      }, 0);
    });
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    current = { id, reject };
    w.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') onProgress?.(msg.stage, msg.fraction);
      else {
        current = null;
        if (msg.type === 'result') resolve(msg.alignment as Alignment);
        else reject(new Error(msg.message));
      }
    };
    w.onerror = (ev) => {
      // e.g. a Content-Security-Policy that forbids blob: workers — fall back to the main thread
      ev.preventDefault();
      current = null;
      worker?.terminate();
      worker = null;
      workerBroken = true;
      setTimeout(() => {
        try {
          resolve(runAlignment(records, settings, onProgress));
        } catch (e) {
          reject(e as Error);
        }
      }, 0);
    };
    w.postMessage({ id, records, settings });
  });
}

export function cancelAlignment(): void {
  if (!current) return;
  current.reject(new Error('cancelled'));
  worker?.terminate();
  worker = null;
  current = null;
}
