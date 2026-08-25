import { receiveTelemetryHandler } from './ingestion.controller.js';
import { telemetryIngestSchema } from './ingestion.schema.js';

export async function ingestionRoutes(fastify) {
  // Direct /{deviceId} HTTP POST Ingestion Route (e.g. POST http://localhost:5001/TM-001)
  fastify.post('/:deviceId', receiveTelemetryHandler);

  // Standard REST API Ingestion Routes
  fastify.post('/api/telemetry/ingest/:deviceId', receiveTelemetryHandler);
  fastify.post('/api/telemetry/ingest', receiveTelemetryHandler);
  fastify.post('/api/ingest', receiveTelemetryHandler);
}
