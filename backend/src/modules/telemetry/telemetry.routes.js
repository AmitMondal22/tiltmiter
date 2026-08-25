import { Op } from 'sequelize';
import { TelemetryRecord } from '../../models/index.js';
import { inMemoryTelemetryStore, queryInfluxTelemetry } from '../../config/influx.js';
import { authenticate } from '../../middleware/authMiddleware.js';

export async function telemetryRoutes(fastify) {
  // Query historical time-series telemetry from InfluxDB OSS Database / PostgreSQL with UTC date support
  fastify.get('/api/telemetry/:deviceId', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    const { deviceId } = req.params;
    const { fromDate, toDate } = req.query || {};

    let startDate = null;
    let stopDate = null;

    try {
      if (fromDate) startDate = new Date(fromDate);
      if (toDate) stopDate = new Date(toDate);
    } catch (e) {}

    // 1. Try querying InfluxDB OSS time-series database
    try {
      const start = startDate ? startDate.toISOString() : '-24h';
      const stop = stopDate ? stopDate.toISOString() : 'now()';

      const influxHistory = await queryInfluxTelemetry(deviceId, start, stop);
      if (influxHistory && influxHistory.length > 0) {
        return reply.send({
          statusCode: 200,
          deviceId,
          source: 'InfluxDB OSS',
          totalPoints: influxHistory.length,
          history: influxHistory,
        });
      }
    } catch (err) {}

    // 2. Query PostgreSQL TelemetryRecord table
    try {
      const whereClause = { deviceId };
      if (startDate || stopDate) {
        whereClause.timestamp = {};
        if (startDate && !isNaN(startDate.getTime())) whereClause.timestamp[Op.gte] = startDate;
        if (stopDate && !isNaN(stopDate.getTime())) whereClause.timestamp[Op.lte] = stopDate;
      }

      const dbRecords = await TelemetryRecord.findAll({
        where: whereClause,
        order: [['timestamp', 'ASC']],
        limit: 1000,
      });

      if (dbRecords && dbRecords.length > 0) {
        const history = dbRecords.map(r => ({
          time: new Date(r.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          timestamp: r.timestamp,
          deviceId: r.deviceId,
          xTilt: parseFloat(r.xTilt || 0),
          yTilt: parseFloat(r.yTilt || 0),
          resultant: parseFloat(r.resultantTilt || 0),
          resultantTilt: parseFloat(r.resultantTilt || 0),
          xDisp: parseFloat(r.xDisplacement || 0),
          yDisp: parseFloat(r.yDisplacement || 0),
          zDisp: parseFloat(r.zDisplacement || 0),
          totalDisp: parseFloat(r.totalDisplacement || 0),
          totalDisplacement: parseFloat(r.totalDisplacement || 0),
          accMag: parseFloat(r.accMag || 0.98),
          vibRMS: parseFloat(r.vibrationRMS || 0.045),
          vibrationRMS: parseFloat(r.vibrationRMS || 0.045),
          vibPeak: parseFloat(r.vibrationPeak || 0.104),
          vibrationPeak: parseFloat(r.vibrationPeak || 0.104),
          temperature: parseFloat(r.temperature || 28.7),
          temp: parseFloat(r.temperature || 28.7),
        }));

        return reply.send({
          statusCode: 200,
          deviceId,
          source: 'PostgreSQL DB',
          totalPoints: history.length,
          history,
        });
      }
    } catch (err) {}

    // 3. Fallback to in-memory store
    const memList = inMemoryTelemetryStore.filter(m => m.deviceId === deviceId);
    return reply.send({
      statusCode: 200,
      deviceId,
      source: 'In-Memory Store',
      totalPoints: memList.length,
      history: memList,
    });
  });
}
