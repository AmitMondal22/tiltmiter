import { Op } from 'sequelize';
import { TelemetryRecord, Device, Site, Project, Organization } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';

export async function reportsRoutes(fastify) {
  // Project-wise, Site-wise, Device-wise Date-to-Date Analytics & Report Generation
  fastify.get('/api/reports/analytics', { preHandler: [authenticate(fastify)] }, async (req, reply) => {
    try {
      const { organizationId, projectId, siteId, deviceId, fromDate, toDate } = req.query || {};

      // Build Device query filter
      const deviceWhere = {};
      if (siteId) deviceWhere.siteId = siteId;
      if (deviceId) deviceWhere.id = deviceId;

      // Find matching device IDs
      const matchingDevices = await Device.findAll({
        where: deviceWhere,
        include: [{
          model: Site,
          where: projectId ? { projectId } : {},
          include: [projectId && organizationId ? { model: Project, where: { organizationId } } : Project],
        }],
      });

      const deviceIds = matchingDevices.map(d => d.id);

      // Build TelemetryRecord query filter
      const telemetryWhere = {};
      if (deviceIds.length > 0) {
        telemetryWhere.deviceId = { [Op.in]: deviceIds };
      } else if (deviceId) {
        telemetryWhere.deviceId = deviceId;
      }

      if (fromDate || toDate) {
        telemetryWhere.timestamp = {};
        if (fromDate) telemetryWhere.timestamp[Op.gte] = new Date(fromDate);
        if (toDate) telemetryWhere.timestamp[Op.lte] = new Date(toDate);
      }

      // Query Time-Series Records from PostgreSQL Table
      const records = await TelemetryRecord.findAll({
        where: telemetryWhere,
        order: [['timestamp', 'ASC']],
        limit: 1000,
      });

      // Compute analytics statistics
      let sumTilt = 0;
      let maxTilt = 0;
      let maxDisp = 0;
      let sumTemp = 0;

      records.forEach(r => {
        sumTilt += (r.resultantTilt || 0);
        if ((r.resultantTilt || 0) > maxTilt) maxTilt = r.resultantTilt;
        if ((r.totalDisplacement || 0) > maxDisp) maxDisp = r.totalDisplacement;
        sumTemp += (r.temperature || 0);
      });

      const totalCount = records.length;
      const avgTilt = totalCount > 0 ? (sumTilt / totalCount).toFixed(4) : 0;
      const avgTemp = totalCount > 0 ? (sumTemp / totalCount).toFixed(2) : 0;

      return reply.send({
        statusCode: 200,
        filters: { organizationId, projectId, siteId, deviceId, fromDate, toDate },
        summary: {
          totalDataPoints: totalCount,
          averageResultantTilt: parseFloat(avgTilt),
          maxResultantTilt: parseFloat(maxTilt.toFixed(4)),
          maxTotalDisplacement_mm: parseFloat(maxDisp.toFixed(4)),
          averageTemperature_C: parseFloat(avgTemp),
        },
        timeSeriesData: records.map(r => ({
          timestamp: r.timestamp,
          deviceId: r.deviceId,
          resultantTilt: r.resultantTilt,
          xTilt: r.xTilt,
          yTilt: r.yTilt,
          totalDisplacement: r.totalDisplacement,
          temperature: r.temperature,
        })),
      });
    } catch (err) {
      return reply.status(500).send({ statusCode: 500, error: 'Report Generation Error', message: err.message });
    }
  });
}
