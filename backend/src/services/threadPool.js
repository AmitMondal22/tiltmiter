import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workerScriptPath = path.join(__dirname, 'mathWorker.js');

const POOL_SIZE = Math.min(os.availableParallelism ? os.availableParallelism() : os.cpus().length, 4);
const workers = [];
const queue = [];
let requestId = 0;
const pendingRequests = new Map();

function initThreadPool() {
  for (let i = 0; i < POOL_SIZE; i++) {
    try {
      const worker = new Worker(workerScriptPath);
      worker.busy = false;

      worker.on('message', ({ id, success, result, error }) => {
        const resolver = pendingRequests.get(id);
        if (resolver) {
          pendingRequests.delete(id);
          if (success) {
            resolver.resolve(result);
          } else {
            resolver.reject(new Error(error));
          }
        }
        worker.busy = false;
        dispatchNext();
      });

      worker.on('error', (err) => {
        console.warn('[Worker Thread Error]:', err.message);
        worker.busy = false;
        dispatchNext();
      });

      workers.push(worker);
    } catch (err) {
      console.warn('[Worker Thread Pool Initialization Warning]:', err.message);
    }
  }
}

function dispatchNext() {
  if (queue.length === 0) return;
  const availableWorker = workers.find((w) => !w.busy);
  if (!availableWorker) return;

  const item = queue.shift();
  availableWorker.busy = true;
  availableWorker.postMessage(item);
}

/**
 * Dispatches heavy mathematical or statistical calculations to real background OS threads
 */
export function executeInThreadPool(task, payload) {
  // If worker threads could not be started, fallback to synchronous compute inline
  if (workers.length === 0) {
    return Promise.resolve(fallbackCompute(task, payload));
  }

  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pendingRequests.set(id, { resolve, reject });
    queue.push({ id, task, payload });
    dispatchNext();
  });
}

function fallbackCompute(task, payload) {
  if (task === 'COMPUTE_DISPLACEMENT') {
    const { xTilt, yTilt, zTilt, gaugeLength = 1000 } = payload;
    const radX = ((xTilt || 0) * Math.PI) / 180;
    const radY = ((yTilt || 0) * Math.PI) / 180;
    const radZ = ((zTilt || 0) * Math.PI) / 180;
    const xDisp = gaugeLength * Math.sin(radX);
    const yDisp = gaugeLength * Math.sin(radY);
    const zDisp = gaugeLength * (1 - Math.cos(radX) * Math.cos(radY));
    const totalDisp = Math.sqrt(xDisp * xDisp + yDisp * yDisp + zDisp * zDisp);
    return { xDisp, yDisp, zDisp, totalDisp };
  }
  return null;
}

export function terminateThreadPool() {
  for (const w of workers) {
    try {
      w.terminate();
    } catch (_) {}
  }
  workers.length = 0;
}

try {
  initThreadPool();
} catch (e) {
  console.warn('[Worker Thread Pool] Notice:', e.message);
}

