import pkg from 'sequelize';
const { Op } = pkg;
import { Device, Site, Structure, Project, Organization, TelemetryRecord } from '../../models/index.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { tenantScopeGuard } from '../../middleware/tenantScopeMiddleware.js';
import { broadcastTelemetry } from '../../websocket/websocket.service.js';
import { inMemoryTelemetryStore } from '../../config/influx.js';

export async function devicesRoutes(fastify) {
  // Query devices scoped by organization
  fastify.get('/api/devices', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const where = {};
      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.organizationId) {
          where.organizationId = req.user.organizationId;
        } else {
          return reply.send({ statusCode: 200, devices: [], statusSummary: { online: 0, offline: 0, alarm: 0, total: 0 } });
        }
      }

      const dbDevices = await Device.findAll({
        where,
        include: [
          {
            model: Site,
            include: [Project, Organization]
          },
          Structure
        ],
        order: [['id', 'ASC']],
      });

      const onlineCount = dbDevices.filter(d => d.status === 'ONLINE').length;
      const offlineCount = dbDevices.filter(d => d.status === 'OFFLINE').length;
      const alarmCount = dbDevices.filter(d => d.status === 'ALARM' || d.status === 'WARNING').length;

      return reply.send({
        statusCode: 200,
        devices: dbDevices || [],
        statusSummary: { online: onlineCount, offline: offlineCount, alarm: alarmCount, total: dbDevices.length }
      });
    } catch (err) {
      return reply.send({
        statusCode: 200,
        devices: [],
        statusSummary: { online: 0, offline: 0, alarm: 0, total: 0 }
      });
    }
  });

  // Query individual device by ID
  fastify.get('/api/devices/:id', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      let device = await Device.findByPk(id, {
        include: [
          {
            model: Site,
            include: [Project, Organization]
          },
          Structure
        ]
      });
      if (!device) {
        device = await Device.findOne({
          where: {
            [Op.or]: [
              { id },
              { id: id.toUpperCase() },
              { id: id.toLowerCase() }
            ]
          },
          include: [
            {
              model: Site,
              include: [Project, Organization]
            },
            Structure
          ]
        });
      }
      if (!device) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Device with ID ${id} not found.`
        });
      }

      if (req.user.role !== 'SUPER_ADMIN' && device.organizationId !== req.user.organizationId) {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Access to device denied across tenant boundaries.',
        });
      }

      return reply.send({
        statusCode: 200,
        device
      });
    } catch (err) {
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: err.message
      });
    }
  });

  // Create Device (with minimum sleep_count >= 15 validation)
  fastify.post('/api/devices', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'ORG_ADMIN' && req.user.role !== 'TECHNICIAN' && req.user.role !== 'ADMIN') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Only Administrators or Technicians can register new devices.',
        });
      }

      const {
        id, name, siteId, structureId, projectId, organizationId,
        serialNumber, status, battery, signalStrength, lifecycleStatus,
        imei, simNumber, structureType, floorPierTower, installationPoint,
        elevation, latitude, longitude, baselineTilt, baselineRoll, baselinePitch,
        sleep_count, wake_count, calibrate
      } = req.body;

      const parsedSleep = sleep_count !== undefined ? parseInt(sleep_count) : 15;
      if (parsedSleep < 15) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Sleep count must be at least 15 minutes.'
        });
      }

      const targetOrgId = req.user.role === 'ORG_ADMIN' ? req.user.organizationId : (organizationId || req.user.organizationId || 1);

      const device = await Device.create({
        id: id || `TILTIND${Date.now().toString().slice(-4)}`,
        name: name || `Tilt Meter ${id}`,
        siteId: siteId || 'SITE-KB01',
        structureId: structureId || null,
        projectId: projectId || 1,
        organizationId: targetOrgId,
        serialNumber: serialNumber || `SN-98210-${Date.now().toString().slice(-4)}`,
        status: status || 'ONLINE',
        battery: battery || '100%',
        signalStrength: signalStrength || '-60 dBm',
        lifecycleStatus: lifecycleStatus || 'ACTIVE',
        imei: imei || '',
        simNumber: simNumber || '',
        structureType: structureType || 'Crash Barrier',
        floorPierTower: floorPierTower || 'Section-01',
        installationPoint: installationPoint || 'Point-A',
        elevation: elevation !== undefined && elevation !== '' ? parseFloat(elevation) : 18.6,
        latitude: latitude !== undefined && latitude !== '' && latitude !== null ? parseFloat(latitude) : null,
        longitude: longitude !== undefined && longitude !== '' && longitude !== null ? parseFloat(longitude) : null,
        baselineTilt: baselineTilt !== undefined ? parseFloat(baselineTilt) : 0.15,
        baselineRoll: baselineRoll !== undefined ? parseFloat(baselineRoll) : 0.05,
        baselinePitch: baselinePitch !== undefined ? parseFloat(baselinePitch) : 0.02,
        sleep_count: parsedSleep,
        wake_count: wake_count !== undefined ? parseInt(wake_count) : 30,
        calibrate: calibrate !== undefined ? Boolean(calibrate) : false,
      });

      const loadedDevice = await Device.findByPk(device.id, {
        include: [{ model: Site, include: [Project, Organization] }, Structure]
      });

      return reply.status(201).send({ statusCode: 201, message: 'Device registered successfully', device: loadedDevice || device });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Update Device / Configure
  fastify.put('/api/devices/:id', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const device = await Device.findByPk(id);
      if (!device) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Device not found' });

      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.role === 'ORG_ADMIN') {
          if (device.organizationId !== req.user.organizationId) {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Cannot modify devices belonging to other organizations.',
            });
          }
        }
      }

      if (req.body.sleep_count !== undefined) {
        const parsedSleep = parseInt(req.body.sleep_count);
        if (parsedSleep < 15) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Validation Error',
            message: 'Sleep count must be at least 15 minutes.'
          });
        }
      }

      const updateData = { ...req.body };
      if (req.user.role === 'ORG_ADMIN') {
        updateData.organizationId = req.user.organizationId;
      }
      if (updateData.latitude !== undefined) {
        updateData.latitude = updateData.latitude !== '' && updateData.latitude !== null ? parseFloat(updateData.latitude) : null;
      }
      if (updateData.longitude !== undefined) {
        updateData.longitude = updateData.longitude !== '' && updateData.longitude !== null ? parseFloat(updateData.longitude) : null;
      }

      await device.update(updateData);
      const updated = await Device.findByPk(id, {
        include: [{ model: Site, include: [Project, Organization] }, Structure]
      });
      return reply.send({ statusCode: 200, message: 'Device updated successfully', device: updated || device });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Set Zero Reference (ClinoX Method: D = L * tan(delta_theta * pi / 180))
  fastify.post('/api/devices/:id/set-reference', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const device = await Device.findByPk(id);
      if (!device) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Device not found' });

      const refThetaX = req.body.refThetaX !== undefined ? parseFloat(req.body.refThetaX) : parseFloat(device.xTilt || 0);
      const refThetaY = req.body.refThetaY !== undefined ? parseFloat(req.body.refThetaY) : parseFloat(device.yTilt || 0);
      const refThetaZ = req.body.refThetaZ !== undefined ? parseFloat(req.body.refThetaZ) : parseFloat(device.zTilt || 0);
      const gaugeLength_mm = req.body.gaugeLength_mm !== undefined ? parseFloat(req.body.gaugeLength_mm) : (parseFloat(device.gaugeLength_mm) || 1000.0);
      const refOperator = req.user?.fullName || req.user?.username || req.body.refOperator || 'Operator';
      const refTimestamp = new Date();

      await device.update({
        refThetaX,
        refThetaY,
        refThetaZ,
        gaugeLength_mm,
        refTimestamp,
        refOperator,
        hasReferenceZero: true,
        calibrate: true,
      });

      return reply.send({
        statusCode: 200,
        message: 'ClinoX zero reference saved successfully',
        device,
        reference: {
          refThetaX,
          refThetaY,
          refThetaZ,
          gaugeLength_mm,
          refTimestamp,
          refOperator,
        }
      });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Reset Zero Reference
  fastify.post('/api/devices/:id/reset-reference', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const device = await Device.findByPk(id);
      if (!device) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Device not found' });

      await device.update({
        refThetaX: 0.0,
        refThetaY: 0.0,
        refThetaZ: 0.0,
        refTimestamp: null,
        hasReferenceZero: false,
      });

      return reply.send({
        statusCode: 200,
        message: 'ClinoX zero reference reset to factory default',
        device,
      });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Set Tilt & Displacement to 0 for a specific device (Updating ONLY tilt and displacement data)
  fastify.post('/api/devices/:id/zero-readings', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const { updateHistory = false, setReference = false } = req.body || {};

      let device = await Device.findByPk(id);
      if (!device) {
        device = await Device.findOne({
          where: {
            [Op.or]: [{ id }, { id: id.toUpperCase() }, { id: id.toLowerCase() }]
          }
        });
      }
      if (!device) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: `Device ${id} not found.` });

      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.role === 'ORG_ADMIN' && device.organizationId !== req.user.organizationId) {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Cannot modify devices belonging to other organizations.',
          });
        }
      }

      const previousValues = {
        xTilt: device.xTilt ?? 0.0,
        yTilt: device.yTilt ?? 0.0,
        resultantTilt: device.resultantTilt ?? 0.0,
        xDisplacement: device.xDisplacement ?? 0.0,
        yDisplacement: device.yDisplacement ?? 0.0,
        totalDisplacement: device.totalDisplacement ?? 0.0,
      };

      const currentRawX = parseFloat(device.xTilt || 0.0);
      const currentRawY = parseFloat(device.yTilt || 0.0);
      const currentRawZ = parseFloat(device.zTilt || 0.0);

      // ONLY tilt and displacement data are updated to 0.000.
      // All other device data (name, status, battery, signalStrength, temperature, organization, etc.) are strictly preserved!
      const fieldsToUpdate = {
        xTilt: 0.0,
        yTilt: 0.0,
        resultantTilt: 0.0,
        xDisplacement: 0.0,
        yDisplacement: 0.0,
        totalDisplacement: 0.0,
        refThetaX: currentRawX,
        refThetaY: currentRawY,
        refThetaZ: currentRawZ,
        refTimestamp: new Date(),
        refOperator: req.user?.fullName || req.user?.username || 'Operator',
        hasReferenceZero: true,
        calibrate: true,
      };

      await device.update(fieldsToUpdate);
      // NOTE: Old historical telemetry records are NEVER overwritten or deleted.
      // Only new incoming packets and the live device state reflect the zero baseline.

      const zeroTimestamp = new Date();
      await TelemetryRecord.create({
        deviceId: device.id,
        timestamp: zeroTimestamp,
        xTilt: 0.0,
        yTilt: 0.0,
        resultantTilt: 0.0,
        xDisplacement: 0.0,
        yDisplacement: 0.0,
        totalDisplacement: 0.0,
        temperature: device.temperature || 25.0,
        rawPayload: { note: 'Manual Zero Calibration Applied', operator: req.user?.username },
      }).catch(() => {});

      if (inMemoryTelemetryStore && inMemoryTelemetryStore.has(device.id)) {
        const hist = inMemoryTelemetryStore.get(device.id);
        hist.push({
          deviceId: device.id,
          timestamp: zeroTimestamp.toISOString(),
          time: zeroTimestamp.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
          xTilt: 0.0,
          yTilt: 0.0,
          resultantTilt: 0.0,
          tiltX: 0.0,
          tiltY: 0.0,
          resultant: 0.0,
          xDisplacement: 0.0,
          yDisplacement: 0.0,
          totalDisplacement: 0.0,
          xDisp: 0.0,
          yDisp: 0.0,
          totalDisp: 0.0,
          temperature: `${device.temperature || 25.0} °C`,
        });
        if (hist.length > 100) hist.shift();
      }

      broadcastTelemetry({
        deviceId: device.id,
        xTilt: 0.0,
        yTilt: 0.0,
        resultantTilt: 0.0,
        xDisplacement: 0.0,
        yDisplacement: 0.0,
        totalDisplacement: 0.0,
        roll: 0.0,
        pitch: 0.0,
        tilt: 0.0,
        tempVal: device.temperature || 25.0,
        temperature: `${device.temperature || 25.0} °C`,
        batteryVoltage: parseFloat(device.battery) || 13.0,
        csq: parseInt(device.signalStrength) || 19,
        timestamp: zeroTimestamp.toISOString(),
        status: device.status,
      });

      const reloadedDevice = await Device.findByPk(device.id, {
        include: [{ model: Site, include: [Project, Organization] }, Structure]
      });

      return reply.send({
        statusCode: 200,
        message: `Tilt and Displacement for device ${device.id} have been set to 0.000. All other device data preserved.`,
        deviceId: device.id,
        device: reloadedDevice || device,
        previousValues,
        updatedFields: fieldsToUpdate,
        historyRecordsUpdated,
      });
    } catch (err) {
      return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: err.message });
    }
  });

  // Bulk / All Devices: Set Tilt & Displacement to 0 (Updating ONLY tilt and displacement data)
  fastify.post('/api/devices/bulk/zero-readings', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { updateHistory = false, setReference = false, deviceIds = [] } = req.body || {};
      const where = {};
      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.organizationId) {
          where.organizationId = req.user.organizationId;
        } else {
          return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'No organization assigned.' });
        }
      }
      if (deviceIds && deviceIds.length > 0) {
        where.id = { [Op.in]: deviceIds };
      }

      const devices = await Device.findAll({ where });
      if (!devices || devices.length === 0) {
        return reply.status(404).send({ statusCode: 404, message: 'No matching devices found to update.' });
      }

      const updatedDeviceIds = [];
      const zeroTimestamp = new Date();

      for (const dev of devices) {
        const currentRawX = parseFloat(dev.xTilt || 0.0);
        const currentRawY = parseFloat(dev.yTilt || 0.0);
        const currentRawZ = parseFloat(dev.zTilt || 0.0);

        const fieldsToUpdate = {
          xTilt: 0.0,
          yTilt: 0.0,
          resultantTilt: 0.0,
          xDisplacement: 0.0,
          yDisplacement: 0.0,
          totalDisplacement: 0.0,
          refThetaX: currentRawX,
          refThetaY: currentRawY,
          refThetaZ: currentRawZ,
          refTimestamp: zeroTimestamp,
          refOperator: req.user?.fullName || req.user?.username || 'Operator',
          hasReferenceZero: true,
          calibrate: true,
        };

        await dev.update(fieldsToUpdate);
        updatedDeviceIds.push(dev.id);
        // NOTE: Old historical telemetry records are strictly preserved and never overwritten or deleted.

        await TelemetryRecord.create({
          deviceId: dev.id,
          timestamp: zeroTimestamp,
          xTilt: 0.0,
          yTilt: 0.0,
          resultantTilt: 0.0,
          xDisplacement: 0.0,
          yDisplacement: 0.0,
          totalDisplacement: 0.0,
          temperature: dev.temperature || 25.0,
          rawPayload: { note: 'Bulk Zero Calibration Applied', operator: req.user?.username },
        }).catch(() => {});

        broadcastTelemetry({
          deviceId: dev.id,
          xTilt: 0.0,
          yTilt: 0.0,
          resultantTilt: 0.0,
          xDisplacement: 0.0,
          yDisplacement: 0.0,
          totalDisplacement: 0.0,
          roll: 0.0,
          pitch: 0.0,
          tilt: 0.0,
          tempVal: dev.temperature || 25.0,
          temperature: `${dev.temperature || 25.0} °C`,
          batteryVoltage: parseFloat(dev.battery) || 13.0,
          csq: parseInt(dev.signalStrength) || 19,
          timestamp: zeroTimestamp.toISOString(),
          status: dev.status,
        });
      }

      return reply.send({
        statusCode: 200,
        message: `Successfully set Tilt and Displacement to 0.000 for ${updatedDeviceIds.length} device(s). All other fields remained unchanged.`,
        updatedDeviceCount: updatedDeviceIds.length,
        updatedDeviceIds,
      });
    } catch (err) {
      return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: err.message });
    }
  });

  // Delete Device
  fastify.delete('/api/devices/:id', { preHandler: [authenticate(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const device = await Device.findByPk(id);
      if (!device) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Device not found' });

      if (req.user.role !== 'SUPER_ADMIN') {
        if (req.user.role === 'ORG_ADMIN') {
          if (device.organizationId !== req.user.organizationId) {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Cannot delete devices belonging to other organizations.',
            });
          }
        } else {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Only Administrators can delete devices.',
          });
        }
      }

      await device.destroy();
      return reply.send({ statusCode: 200, message: 'Device deleted successfully' });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });
}

