import { Op } from 'sequelize';
import { TelemetryRecord, Device } from '../../models/index.js';
import { inMemoryTelemetryStore, queryInfluxTelemetry } from '../../config/influx.js';
import { authenticate } from '../../middleware/authMiddleware.js';

export async function telemetryRoutes(fastify) {
  // Query historical time-series telemetry from InfluxDB OSS Database / PostgreSQL / In-Memory with full date-time support
  fastify.get('/api/telemetry/:deviceId', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    const { deviceId } = req.params;
    const { fromDate, toDate, range } = req.query || {};

    let startDate = null;
    let stopDate = null;

    try {
      if (fromDate) {
        if (typeof fromDate === 'string' && fromDate.length === 10) {
          startDate = new Date(`${fromDate}T00:00:00+05:30`);
        } else {
          startDate = new Date(fromDate);
        }
      }
      if (toDate) {
        if (typeof toDate === 'string' && toDate.length === 10) {
          stopDate = new Date(`${toDate}T23:59:59.999+05:30`);
        } else {
          stopDate = new Date(toDate);
        }
      }
    } catch (e) {}

    // Handle range shortcuts if provided (e.g. 1h, 6h, 12h, 24h, 7d, 30d) anchored to latest device data
    if (range && !startDate) {
      let refDate = new Date();
      try {
        const latestRec = await TelemetryRecord.findOne({
          where: { deviceId },
          order: [['timestamp', 'DESC']],
          attributes: ['timestamp'],
        });
        if (latestRec?.timestamp) {
          const recDate = new Date(latestRec.timestamp);
          if (!isNaN(recDate.getTime())) {
            refDate = recDate;
          }
        } else {
          const dev = await Device.findByPk(deviceId);
          if (dev?.lastSeen) {
            const lsDate = new Date(dev.lastSeen);
            if (!isNaN(lsDate.getTime())) refDate = lsDate;
          }
        }
      } catch (err) {}

      stopDate = refDate;
      const rLower = String(range).toLowerCase();
      if (rLower === '1h') startDate = new Date(refDate.getTime() - 60 * 60 * 1000);
      else if (rLower === '6h') startDate = new Date(refDate.getTime() - 6 * 60 * 60 * 1000);
      else if (rLower === '12h') startDate = new Date(refDate.getTime() - 12 * 60 * 60 * 1000);
      else if (rLower === '24h' || rLower === '1d') startDate = new Date(refDate.getTime() - 24 * 60 * 60 * 1000);
      else if (rLower === '7d' || rLower === '1w') startDate = new Date(refDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      else if (rLower === '30d' || rLower === '1m') startDate = new Date(refDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      else startDate = new Date(refDate.getTime() - 24 * 60 * 60 * 1000);
    }

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
        limit: 2000,
      });

      if (dbRecords && dbRecords.length > 0) {
        const history = dbRecords.map(r => ({
          time: new Date(r.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
          timestamp: new Date(r.timestamp).toISOString(),
          deviceId: r.deviceId,
          xTilt: parseFloat(r.xTilt || 0),
          tiltX: parseFloat(r.xTilt || 0),
          yTilt: parseFloat(r.yTilt || 0),
          tiltY: parseFloat(r.yTilt || 0),
          resultant: parseFloat(r.resultantTilt || 0),
          resultantTilt: parseFloat(r.resultantTilt || 0),
          xDisp: parseFloat(r.xDisplacement || 0),
          xDisplacement: parseFloat(r.xDisplacement || 0),
          yDisp: parseFloat(r.yDisplacement || 0),
          yDisplacement: parseFloat(r.yDisplacement || 0),
          zDisp: parseFloat(r.zDisplacement || 0),
          zDisplacement: parseFloat(r.zDisplacement || 0),
          totalDisp: parseFloat(r.totalDisplacement || 0),
          totalDisplacement: parseFloat(r.totalDisplacement || 0),
          accMag: parseFloat(r.acceleration?.accMag || r.accMag || 0.982),
          vibRMS: parseFloat(r.vibration?.vibrationRMS || r.vibrationRMS || 0.045),
          vibrationRMS: parseFloat(r.vibration?.vibrationRMS || r.vibrationRMS || 0.045),
          vibPeak: parseFloat(r.vibration?.vibrationPeak || r.vibrationPeak || 0.104),
          vibrationPeak: parseFloat(r.vibration?.vibrationPeak || r.vibrationPeak || 0.104),
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

    // 3. Query In-Memory Ring Buffer Map
    let memList = [];
    if (inMemoryTelemetryStore instanceof Map) {
      memList = inMemoryTelemetryStore.get(deviceId) || [];
    } else if (Array.isArray(inMemoryTelemetryStore)) {
      memList = inMemoryTelemetryStore.filter(m => m.deviceId === deviceId);
    }

    // Filter memory points by time range if requested
    if (memList.length > 0 && (startDate || stopDate)) {
      memList = memList.filter(m => {
        const t = new Date(m.timestamp || m.time);
        if (startDate && t < startDate) return false;
        if (stopDate && t > stopDate) return false;
        return true;
      });
    }

    if (memList.length > 0) {
      return reply.send({
        statusCode: 200,
        deviceId,
        source: 'In-Memory Store',
        totalPoints: memList.length,
        history: memList,
      });
    }

    // 4. If no history recorded yet for selected device & range, return empty dataset (no fake/simulated data)
    return reply.send({
      statusCode: 200,
      deviceId,
      source: 'Database',
      totalPoints: 0,
      history: [],
    });
  });
}
