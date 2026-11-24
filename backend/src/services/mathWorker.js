import { parentPort } from 'node:worker_threads';

if (parentPort) {
  parentPort.on('message', ({ id, task, payload }) => {
    try {
      let result;
      switch (task) {
        case 'COMPUTE_DISPLACEMENT': {
          const { xTilt, yTilt, zTilt, gaugeLength = 1000 } = payload;
          const radX = ((xTilt || 0) * Math.PI) / 180;
          const radY = ((yTilt || 0) * Math.PI) / 180;
          const radZ = ((zTilt || 0) * Math.PI) / 180;
          const xDisp = gaugeLength * Math.sin(radX);
          const yDisp = gaugeLength * Math.sin(radY);
          const zDisp = gaugeLength * (1 - Math.cos(radX) * Math.cos(radY));
          const totalDisp = Math.sqrt(xDisp * xDisp + yDisp * yDisp + zDisp * zDisp);
          result = { xDisp, yDisp, zDisp, totalDisp };
          break;
        }
        case 'ANALYZE_SERIES': {
          const { values } = payload;
          if (!Array.isArray(values) || values.length === 0) {
            result = { count: 0, min: null, max: null, mean: null, stdDev: null };
            break;
          }
          let min = values[0];
          let max = values[0];
          let sum = 0;
          for (let i = 0; i < values.length; i++) {
            const v = values[i];
            if (v < min) min = v;
            if (v > max) max = v;
            sum += v;
          }
          const mean = sum / values.length;
          let varianceSum = 0;
          for (let i = 0; i < values.length; i++) {
            varianceSum += Math.pow(values[i] - mean, 2);
          }
          const stdDev = Math.sqrt(varianceSum / values.length);
          result = { count: values.length, min, max, mean, stdDev };
          break;
        }
        case 'CALCULATE_RMS': {
          const { samples } = payload;
          if (!Array.isArray(samples) || samples.length === 0) {
            result = { rms: 0, peak: 0 };
            break;
          }
          let sumSquares = 0;
          let peak = 0;
          for (let i = 0; i < samples.length; i++) {
            const abs = Math.abs(samples[i]);
            if (abs > peak) peak = abs;
            sumSquares += samples[i] * samples[i];
          }
          const rms = Math.sqrt(sumSquares / samples.length);
          result = { rms, peak };
          break;
        }
        default:
          throw new Error(`Unknown task: ${task}`);
      }
      parentPort.postMessage({ id, success: true, result });
    } catch (err) {
      parentPort.postMessage({ id, success: false, error: err.message });
    }
  });
}

