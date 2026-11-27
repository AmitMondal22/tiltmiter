import cluster from 'node:cluster';
import os from 'node:os';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { testDbConnection } from './config/db.js';
import { initSequelize, sequelize } from './config/sequelize.js';
import { seedDatabase } from './db/seed.js';
import { registerWebSocketHandler } from './websocket/websocket.service.js';

import { authRoutes } from './modules/auth/auth.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { organizationsRoutes } from './modules/organizations/organizations.routes.js';
import { projectsRoutes } from './modules/projects/projects.routes.js';
import { sitesRoutes } from './modules/sites/sites.routes.js';
import { devicesRoutes } from './modules/devices/devices.routes.js';
import { telemetryRoutes } from './modules/telemetry/telemetry.routes.js';
import { ingestionRoutes } from './modules/ingestion/ingestion.routes.js';
import { alarmsRoutes } from './modules/alarms/alarms.routes.js';
import { reportsRoutes } from './modules/reports/reports.routes.js';
import { subscriptionsRoutes } from './modules/subscriptions/subscriptions.routes.js';
import { incidentsRoutes } from './modules/incidents/incidents.routes.js';
import { maintenanceRoutes } from './modules/maintenance/maintenance.routes.js';
import { structuresRoutes } from './modules/structures/structures.routes.js';
import { notificationsRoutes } from './modules/notifications/notifications.routes.js';
import { startTelemetrySimulator, stopTelemetrySimulator } from './services/telemetrySimulatorService.js';
import './services/threadPool.js'; // Initialize Worker Thread pool for heavy CPU/math operations

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', 'uploads');

// Ensure permanent upload storage directories exist
[uploadsDir, path.join(uploadsDir, 'logos'), path.join(uploadsDir, 'device_image'), path.join(uploadsDir, 'project_image'), path.join(uploadsDir, 'tickets')].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const PORT = parseInt(process.env.PORT || '5001', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Multi-Threading & Cluster Configuration
const CLUSTER_ENABLED = process.env.CLUSTER_ENABLED !== 'false';
const AVAILABLE_CPUS = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
// Default to multi-core workers (capped at 4 or available cores, configurable via WORKERS_COUNT)
const WORKERS_COUNT = parseInt(process.env.WORKERS_COUNT || process.env.CLUSTER_WORKERS || '', 10) || Math.min(AVAILABLE_CPUS, 4);

// ─────────────────────────────────────────────────────────────────────────────
// 1. PRIMARY / MASTER PROCESS (Clustering Manager & Watchdog Singleton)
// ─────────────────────────────────────────────────────────────────────────────
if (cluster.isPrimary && CLUSTER_ENABLED && WORKERS_COUNT > 1) {
  console.log('================================================================');
  console.log(`🚀 [Cluster Primary] Master PID ${process.pid} running on Node.js ${process.version}`);
  console.log(`🧵 [Multi-Threading] Launching ${WORKERS_COUNT} worker threads/processes (Hardware Cores: ${AVAILABLE_CPUS})`);
  console.log('================================================================');

  // Verify database connection and seed once from primary before workers launch
  await testDbConnection();
  const isDbConnected = await initSequelize();
  if (isDbConnected) {
    await seedDatabase();
  }

  // Start 16-minute silence watchdog simulator as singleton in primary process
  startTelemetrySimulator();

  function setupWorkerIPC(worker) {
    worker.on('message', (msg) => {
      // Forward real-time telemetry/alarm broadcast messages to all sibling workers
      if (msg && (msg.type === 'CLUSTER_BROADCAST_TELEMETRY' || msg.type === 'CLUSTER_BROADCAST_ALARM')) {
        for (const id in cluster.workers) {
          const w = cluster.workers[id];
          if (w && w.id !== worker.id && w.isConnected()) {
            w.send(msg);
          }
        }
      }
    });
  }

  // Fork worker threads
  for (let i = 0; i < WORKERS_COUNT; i++) {
    const worker = cluster.fork();
    setupWorkerIPC(worker);
  }

  // Auto-healing / Resilient Respawn: automatically replace any worker that exits
  cluster.on('exit', (worker, code, signal) => {
    console.warn(`⚠️ [Cluster Primary] Worker #${worker.id} (PID ${worker.process.pid}) exited (${signal || code}). Respawning replacement worker...`);
    const newWorker = cluster.fork();
    setupWorkerIPC(newWorker);
  });

  // Graceful shutdown handlers for primary process
  const closePrimaryGracefully = async (signal) => {
    console.log(`\n[Primary PID ${process.pid}] Received ${signal}. Terminating all workers cleanly...`);
    stopTelemetrySimulator();
    for (const id in cluster.workers) {
      const w = cluster.workers[id];
      if (w) w.process.kill(signal);
    }
    await sequelize.close().catch(() => {});
    process.exit(0);
  };

  process.on('SIGINT', () => closePrimaryGracefully('SIGINT'));
  process.on('SIGTERM', () => closePrimaryGracefully('SIGTERM'));

} else {
  // ─────────────────────────────────────────────────────────────────────────────
  // 2. WORKER PROCESS (Fastify REST API & WebSocket Thread Instance)
  // ─────────────────────────────────────────────────────────────────────────────
  startWorker();
}

async function startWorker() {
  const isWorkerThread = cluster.isWorker;
  const workerTag = isWorkerThread ? `Worker #${cluster.worker.id} (PID ${process.pid})` : `Standalone (PID ${process.pid})`;

  try {
    // In standalone single-process mode, initialize DB and simulator directly
    if (!isWorkerThread) {
      await testDbConnection();
      const isDbConnected = await initSequelize();
      if (isDbConnected) {
        await seedDatabase();
      }
      startTelemetrySimulator();
    } else {
      // In clustered worker, initialize sequelize connection pool for this process
      await initSequelize();
    }

    const fastify = Fastify({
      logger: process.env.NODE_ENV === 'production' ? false : true,
      bodyLimit: 15 * 1024 * 1024, // 15MB limit for high-res images and large telemetry arrays
    });

    // Content Parsers
    fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      if (!body || typeof body !== 'string' || body.trim() === '') {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(body));
      } catch (err) {
        err.statusCode = 400;
        done(err, undefined);
      }
    });

    fastify.addContentTypeParser(['text/plain', 'text/json', 'application/octet-stream'], { parseAs: 'string' }, (req, body, done) => {
      if (!body || typeof body !== 'string' || body.trim() === '') {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(body));
      } catch (_) {
        done(null, body);
      }
    });

    // CORS Configuration
    await fastify.register(cors, {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Allow-Origin'],
      exposedHeaders: ['Authorization'],
    });

    // Serve permanent upload files statically
    await fastify.register(fastifyStatic, {
      root: uploadsDir,
      prefix: '/uploads/',
      decorateReply: false,
      setHeaders: (res) => {
        const setHdr = res.setHeader ? res.setHeader.bind(res) : (res.header ? res.header.bind(res) : () => {});
        setHdr('Access-Control-Allow-Origin', '*');
        setHdr('Cross-Origin-Resource-Policy', 'cross-origin');
        setHdr('Cache-Control', 'no-cache, public, max-age=0');
      },
    });

    // Global Error Handler
    fastify.setErrorHandler((error, request, reply) => {
      fastify.log.error(error);
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      reply.status(error.statusCode || 500).send({
        statusCode: error.statusCode || 500,
        error: error.name || 'Internal Server Error',
        message: error.message || 'An unexpected error occurred',
      });
    });

    fastify.addHook('onSend', (request, reply, payload, done) => {
      if (request.url && request.url.startsWith('/uploads/')) {
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
        reply.header('Cache-Control', 'no-cache, public, max-age=0');
      }
      done();
    });

    await fastify.register(fastifyJwt, { secret: process.env.JWT_SECRET || 'super_secret_jwt_key_tiltmeter_360_prod_2026' });
    await fastify.register(fastifyWebsocket);

    // Register WebSocket Telemetry Stream (with cluster-aware IPC synchronization)
    registerWebSocketHandler(fastify);

    // Register Modular API Routes
    await fastify.register(authRoutes);
    await fastify.register(usersRoutes);
    await fastify.register(organizationsRoutes);
    await fastify.register(projectsRoutes);
    await fastify.register(sitesRoutes);
    await fastify.register(devicesRoutes);
    await fastify.register(telemetryRoutes);
    await fastify.register(ingestionRoutes);
    await fastify.register(alarmsRoutes);
    await fastify.register(reportsRoutes);
    await fastify.register(subscriptionsRoutes);
    await fastify.register(incidentsRoutes);
    await fastify.register(maintenanceRoutes);
    await fastify.register(structuresRoutes);
    await fastify.register(notificationsRoutes);

    // Health & Cluster Info Endpoint
    fastify.get('/health', async () => {
      return {
        status: 'OK',
        service: 'Tiltmeter 360 Multi-Threaded API Server',
        mode: isWorkerThread ? 'multi-thread-cluster' : 'single-process',
        workerId: isWorkerThread ? cluster.worker.id : 1,
        pid: process.pid,
        activeThreads: isWorkerThread ? WORKERS_COUNT : 1,
        hardwareCores: AVAILABLE_CPUS,
        timestamp: new Date().toISOString(),
      };
    });

    // Graceful shutdown for worker
    const closeWorker = async (signal) => {
      console.log(`[${workerTag}] Closing on ${signal}...`);
      try {
        if (!isWorkerThread) stopTelemetrySimulator();
        await fastify.close();
        await sequelize.close().catch(() => {});
      } catch (err) {
        console.error(`[${workerTag}] Shutdown error:`, err.message);
      }
      process.exit(0);
    };

    process.on('SIGINT', () => closeWorker('SIGINT'));
    process.on('SIGTERM', () => closeWorker('SIGTERM'));

    // Start listening on shared cluster port
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`⚡ [${workerTag}] Ready & listening at http://${HOST}:${PORT}`);
  } catch (err) {
    console.error(`❌ [${workerTag}] Failed to start:`, err);
    process.exit(1);
  }
}
