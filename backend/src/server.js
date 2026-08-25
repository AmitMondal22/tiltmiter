import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyWebsocket from '@fastify/websocket';
import dotenv from 'dotenv';

import { testDbConnection } from './config/db.js';
import { initSequelize } from './config/sequelize.js';
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

dotenv.config();

const fastify = Fastify({
  logger: true,
});

// Register Plugins with full cross-origin (CORS) access
await fastify.register(cors, {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Allow-Origin'],
  exposedHeaders: ['Authorization'],
});

// Global Error Handler to guarantee CORS headers on all error responses
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

await fastify.register(fastifyJwt, { secret: process.env.JWT_SECRET || 'super_secret_jwt_key_tiltmeter_360_prod_2026' });
await fastify.register(fastifyWebsocket);

// Register WebSocket Telemetry Stream
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

// Health Check Endpoint
fastify.get('/health', async () => {
  return { status: 'OK', service: 'Tiltmeter 360 Fastify Backend API', timestamp: new Date().toISOString() };
});

const PORT = parseInt(process.env.PORT || '5001', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function startServer() {
  try {
    // 1. Connect PostgreSQL & Sync Sequelize Models
    await testDbConnection();
    await initSequelize();
    await seedDatabase();

    // 2. Start Fastify Server
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`🚀 Fastify REST API & WebSocket Server running at http://${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

startServer();
