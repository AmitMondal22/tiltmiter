import pkg from 'sequelize';
const { Op } = pkg;
import { Device, Site, Structure, Project, Organization, TelemetryRecord } from '../../models/index.js';
import { authenticate, authenticateOptional } from '../../middleware/authMiddleware.js';
import { tenantScopeGuard } from '../../middleware/tenantScopeMiddleware.js';
import { broadcastTelemetry } from '../../websocket/websocket.service.js';
import { inMemoryTelemetryStore } from '../../config/influx.js';

export async function devicesRoutes(fastify) {
  // Query devices scoped by organization (supports direct access with authenticateOptional)
  fastify.get('/api/devices', { preHandler: [authenticateOptional(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const where = {};
      if (req.user?.role && req.user.role !== 'SUPER_ADMIN') {
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
  fastify.get('/api/devices/:id', { preHandler: [authenticateOptional(fastify), tenantScopeGuard()] }, async (req, reply) => {
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

      if (req.user?.role && req.user.role !== 'SUPER_ADMIN' && device.organizationId && device.organizationId !== req.user.organizationId) {
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
  fastify.put('/api/devices/:id', { preHandler: [authenticateOptional(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      let device = await Device.findByPk(id);
      if (!device && Op) {
        device = await Device.findOne({
          where: {
            [Op.or]: [
              { id },
              { id: String(id).toUpperCase() },
              { id: String(id).toLowerCase() }
            ]
          }
        });
      }
      if (!device) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Device not found' });

      if (req.user?.role && req.user.role !== 'SUPER_ADMIN') {
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

      const updateData = { ...req.body };
      delete updateData.id; // Do not update primary key id

      if (req.user?.role === 'ORG_ADMIN') {
        updateData.organizationId = req.user.organizationId;
      } else if (updateData.organizationId !== undefined) {
        updateData.organizationId = updateData.organizationId !== '' && updateData.organizationId !== null ? parseInt(updateData.organizationId) : null;
      }

      if (updateData.projectId !== undefined) {
        updateData.projectId = updateData.projectId !== '' && updateData.projectId !== null ? parseInt(updateData.projectId) : null;
      }

      if (updateData.structureId !== undefined) {
        updateData.structureId = updateData.structureId !== '' && updateData.structureId !== null ? String(updateData.structureId).trim() : null;
      }

      if (updateData.siteId !== undefined) {
        updateData.siteId = updateData.siteId !== '' && updateData.siteId !== null ? String(updateData.siteId).trim() : null;
      }

      if (updateData.latitude !== undefined) {
        updateData.latitude = updateData.latitude !== '' && updateData.latitude !== null && !isNaN(parseFloat(updateData.latitude))
          ? parseFloat(updateData.latitude)
          : null;
      }

      if (updateData.longitude !== undefined) {
        updateData.longitude = updateData.longitude !== '' && updateData.longitude !== null && !isNaN(parseFloat(updateData.longitude))
          ? parseFloat(updateData.longitude)
          : null;
      }

      if (updateData.elevation !== undefined) {
        updateData.elevation = updateData.elevation !== '' && updateData.elevation !== null && !isNaN(parseFloat(updateData.elevation))
          ? parseFloat(updateData.elevation)
          : null;
      }

      if (updateData.gaugeLength_mm !== undefined) {
        updateData.gaugeLength_mm = updateData.gaugeLength_mm !== '' && updateData.gaugeLength_mm !== null && !isNaN(parseFloat(updateData.gaugeLength_mm))
          ? parseFloat(updateData.gaugeLength_mm)
          : 1000.0;
      }

      if (updateData.sleep_count !== undefined) {
        if (updateData.sleep_count === '' || updateData.sleep_count === null) {
          delete updateData.sleep_count;
        } else {
          const parsedSleep = parseInt(updateData.sleep_count);
          if (!isNaN(parsedSleep)) {
            if (parsedSleep < 15) {
              return reply.status(400).send({
                statusCode: 400,
                error: 'Validation Error',
                message: 'Sleep count must be at least 15 minutes.'
              });
            }
            updateData.sleep_count = parsedSleep;
          } else {
            delete updateData.sleep_count;
          }
        }
      }

      if (updateData.wake_count !== undefined) {
        if (updateData.wake_count === '' || updateData.wake_count === null) {
          delete updateData.wake_count;
        } else {
          const parsedWake = parseInt(updateData.wake_count);
          updateData.wake_count = !isNaN(parsedWake) && parsedWake > 0 ? parsedWake : 30;
        }
      }

      if (updateData.calibrate !== undefined) {
        const isCalibrate = updateData.calibrate === true || updateData.calibrate === 'true' || updateData.calibrate === 1 || updateData.calibrate === '1';
        updateData.calibrate = isCalibrate;
        updateData.hasReferenceZero = isCalibrate;
        if (isCalibrate) {
          if (!device.refThetaX && !device.refThetaY) {
            updateData.refThetaX = parseFloat(device.xTilt || 0.0);
            updateData.refThetaY = parseFloat(device.yTilt || 0.0);
            updateData.refThetaZ = parseFloat(device.zTilt || 0.0);
            updateData.refTimestamp = new Date();
          }
        }
      }

      await device.update(updateData);
      const updated = await Device.findByPk(device.id, {
        include: [{ model: Site, include: [Project, Organization] }, Structure]
      });
      return reply.send({ statusCode: 200, message: 'Device updated successfully', device: updated || device });
    } catch (err) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
    }
  });

  // Set Zero Reference (ClinoX Method: D = L * tan(delta_theta * pi / 180))
  fastify.post('/api/devices/:id/set-reference', { preHandler: [authenticateOptional(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const device = await Device.findByPk(id);
      if (!device) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Device not found' });

      const refThetaX = req.body.refThetaX !== undefined ? parseFloat(req.body.refThetaX) : parseFloat(device.xTilt || 0);
      const refThetaY = req.body.refThetaY !== undefined ? parseFloat(req.body.refThetaY) : parseFloat(device.yTilt || 0);
      const refThetaZ = req.body.refThetaZ !== undefined ? parseFloat(req.body.refThetaZ) : parseFloat(device.zTilt || 0);
      const gaugeLength_mm = req.body.gaugeLength_mm !== undefined ? parseFloat(req.body.gaugeLength_mm) : (parseFloat(device.gaugeLength_mm) || 1000.0);
      const refOperator = req.user?.fullName || req.user?.username || req.body?.refOperator || 'Operator';
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
  fastify.post('/api/devices/:id/reset-reference', { preHandler: [authenticateOptional(fastify), tenantScopeGuard()] }, async (req, reply) => {
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
  fastify.post('/api/devices/:id/zero-readings', { preHandler: [authenticateOptional(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const id = req.params?.id || req.body?.deviceId;
      const { scope = 'all', setReference = true } = req.body || {};

      if (!id) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Device ID is required.' });
      }

      let device = await Device.findByPk(id);
      if (!device) {
        device = await Device.findOne({
          where: {
            [Op.or]: [{ id }, { id: String(id).toUpperCase() }, { id: String(id).toLowerCase() }]
          }
        });
      }
      if (!device) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: `Device ${id} not found.` });

      if (req.user?.role && req.user.role !== 'SUPER_ADMIN') {
        if (req.user.role === 'ORG_ADMIN' && device.organizationId && device.organizationId !== req.user.organizationId) {
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
        zDisplacement: device.zDisplacement ?? 0.0,
        totalDisplacement: device.totalDisplacement ?? 0.0,
      };

      const currentRawX = parseFloat(device.xTilt || 0.0);
      const currentRawY = parseFloat(device.yTilt || 0.0);
      const currentRawZ = parseFloat(device.zTilt || 0.0);

      // 1. Update Device current readings and baseline reference (keeping original date/time and non-tilt fields untouched)
      const fieldsToUpdate = {
        xTilt: 0.0,
        yTilt: 0.0,
        zTilt: 0.0,
        resultantTilt: 0.0,
        xDisplacement: 0.0,
        yDisplacement: 0.0,
        zDisplacement: 0.0,
        totalDisplacement: 0.0,
        baselineTilt: 0.0,
        baselineRoll: 0.0,
        baselinePitch: 0.0,
      };

      if (setReference) {
        fieldsToUpdate.refThetaX = currentRawX;
        fieldsToUpdate.refThetaY = currentRawY;
        fieldsToUpdate.refThetaZ = currentRawZ;
        fieldsToUpdate.refTimestamp = device.lastSeen || new Date();
        fieldsToUpdate.refOperator = req.user?.fullName || req.user?.username || req.body?.refOperator || 'Operator';
        fieldsToUpdate.hasReferenceZero = true;
        fieldsToUpdate.calibrate = true;
      }

      await device.update(fieldsToUpdate);

      // 2. Safely update datapoint records in TelemetryRecord WITHOUT CHANGING DATE TIME
      let recordsUpdatedCount = 0;
      try {
        if (scope === 'last') {
          // Find single latest record for this device
          const latestRecord = await TelemetryRecord.findOne({
            where: {
              [Op.or]: [
                { deviceId: device.id },
                { deviceId: device.id.toUpperCase() },
                { deviceId: device.id.toLowerCase() }
              ]
            },
            order: [['timestamp', 'DESC']],
          });

          if (latestRecord) {
            await latestRecord.update({
              xTilt: 0.0,
              yTilt: 0.0,
              resultantTilt: 0.0,
              xDisplacement: 0.0,
              yDisplacement: 0.0,
              zDisplacement: 0.0,
              totalDisplacement: 0.0,
            });
            recordsUpdatedCount = 1;
          } else if (device.lastSeen) {
            await TelemetryRecord.create({
              deviceId: device.id,
              timestamp: device.lastSeen,
              xTilt: 0.0,
              yTilt: 0.0,
              resultantTilt: 0.0,
              xDisplacement: 0.0,
              yDisplacement: 0.0,
              zDisplacement: 0.0,
              totalDisplacement: 0.0,
              temperature: parseFloat(device.temperature) || 25.0,
            });
            recordsUpdatedCount = 1;
          }
        } else {
          // scope === 'all': update all datapoints of the selected device without changing date time
          const [count] = await TelemetryRecord.update(
            {
              xTilt: 0.0,
              yTilt: 0.0,
              resultantTilt: 0.0,
              xDisplacement: 0.0,
              yDisplacement: 0.0,
              zDisplacement: 0.0,
              totalDisplacement: 0.0,
            },
            {
              where: {
                [Op.or]: [
                  { deviceId: device.id },
                  { deviceId: device.id.toUpperCase() },
                  { deviceId: device.id.toLowerCase() }
                ]
              }
            }
          );
          recordsUpdatedCount = count;
          if (count === 0 && device.lastSeen) {
            await TelemetryRecord.create({
              deviceId: device.id,
              timestamp: device.lastSeen,
              xTilt: 0.0,
              yTilt: 0.0,
              resultantTilt: 0.0,
              xDisplacement: 0.0,
              yDisplacement: 0.0,
              zDisplacement: 0.0,
              totalDisplacement: 0.0,
              temperature: parseFloat(device.temperature) || 25.0,
            });
            recordsUpdatedCount = 1;
          }
        }
      } catch (telemetryErr) {
        console.warn(`[Zero Readings] TelemetryRecord update skipped:`, telemetryErr.message);
      }

      // 3. Update in-memory telemetry points preserving their original timestamp/time
      if (inMemoryTelemetryStore && inMemoryTelemetryStore.has(device.id)) {
        const hist = inMemoryTelemetryStore.get(device.id);
        if (scope === 'last' && hist.length > 0) {
          const lastPt = hist[hist.length - 1];
          lastPt.xTilt = 0.0;
          lastPt.yTilt = 0.0;
          lastPt.resultantTilt = 0.0;
          lastPt.tiltX = 0.0;
          lastPt.tiltY = 0.0;
          lastPt.resultant = 0.0;
          lastPt.xDisplacement = 0.0;
          lastPt.yDisplacement = 0.0;
          lastPt.zDisplacement = 0.0;
          lastPt.totalDisplacement = 0.0;
          lastPt.xDisp = 0.0;
          lastPt.yDisp = 0.0;
          lastPt.totalDisp = 0.0;
        } else {
          hist.forEach(pt => {
            pt.xTilt = 0.0;
            pt.yTilt = 0.0;
            pt.resultantTilt = 0.0;
            pt.tiltX = 0.0;
            pt.tiltY = 0.0;
            pt.resultant = 0.0;
            pt.xDisplacement = 0.0;
            pt.yDisplacement = 0.0;
            pt.zDisplacement = 0.0;
            pt.totalDisplacement = 0.0;
            pt.xDisp = 0.0;
            pt.yDisp = 0.0;
            pt.totalDisp = 0.0;
          });
        }
      }

      // 4. Broadcast live update preserving original lastSeen date time
      const originalTime = device.lastSeen ? new Date(device.lastSeen).toISOString() : new Date().toISOString();
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
        timestamp: originalTime,
        status: device.status,
      });

      const reloadedDevice = await Device.findByPk(device.id, {
        include: [{ model: Site, include: [Project, Organization] }, Structure]
      });

      return reply.send({
        statusCode: 200,
        message: scope === 'last'
          ? `Last data point for device ${device.id} updated to 0.000 without changing date/time.`
          : `All ${recordsUpdatedCount} data point(s) for device ${device.id} updated to 0.000 without changing date/time.`,
        deviceId: device.id,
        scope,
        recordsUpdatedCount,
        device: reloadedDevice || device,
        previousValues,
        updatedFields: fieldsToUpdate,
      });
    } catch (err) {
      return reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: err.message });
    }
  });

  // Bulk / All Devices: Set Tilt & Displacement to 0 (Updating ONLY tilt and displacement data without changing date/time)
  fastify.post('/api/devices/bulk/zero-readings', { preHandler: [authenticateOptional(fastify), tenantScopeGuard()] }, async (req, reply) => {
    try {
      const { scope = 'all', setReference = true, deviceIds = [] } = req.body || {};
      const where = {};
      if (req.user?.role && req.user.role !== 'SUPER_ADMIN') {
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

      for (const dev of devices) {
        const currentRawX = parseFloat(dev.xTilt || 0.0);
        const currentRawY = parseFloat(dev.yTilt || 0.0);
        const currentRawZ = parseFloat(dev.zTilt || 0.0);

        const fieldsToUpdate = {
          xTilt: 0.0,
          yTilt: 0.0,
          zTilt: 0.0,
          resultantTilt: 0.0,
          xDisplacement: 0.0,
          yDisplacement: 0.0,
          zDisplacement: 0.0,
          totalDisplacement: 0.0,
          baselineTilt: 0.0,
          baselineRoll: 0.0,
          baselinePitch: 0.0,
        };

        if (setReference) {
          fieldsToUpdate.refThetaX = currentRawX;
          fieldsToUpdate.refThetaY = currentRawY;
          fieldsToUpdate.refThetaZ = currentRawZ;
          fieldsToUpdate.refTimestamp = dev.lastSeen || new Date();
          fieldsToUpdate.refOperator = req.user?.fullName || req.user?.username || req.body?.refOperator || 'Operator';
          fieldsToUpdate.hasReferenceZero = true;
          fieldsToUpdate.calibrate = true;
        }

        await dev.update(fieldsToUpdate);
        updatedDeviceIds.push(dev.id);

        // Safely update datapoint records in TelemetryRecord WITHOUT CHANGING DATE TIME
        try {
          if (scope === 'last') {
            const lastRec = await TelemetryRecord.findOne({
              where: {
                [Op.or]: [
                  { deviceId: dev.id },
                  { deviceId: dev.id.toUpperCase() },
                  { deviceId: dev.id.toLowerCase() }
                ]
              },
              order: [['timestamp', 'DESC']],
            });
            if (lastRec) {
              await lastRec.update({
                xTilt: 0.0,
                yTilt: 0.0,
                resultantTilt: 0.0,
                xDisplacement: 0.0,
                yDisplacement: 0.0,
                zDisplacement: 0.0,
                totalDisplacement: 0.0,
              });
            } else if (dev.lastSeen) {
              await TelemetryRecord.create({
                deviceId: dev.id,
                timestamp: dev.lastSeen,
                xTilt: 0.0,
                yTilt: 0.0,
                resultantTilt: 0.0,
                xDisplacement: 0.0,
                yDisplacement: 0.0,
                zDisplacement: 0.0,
                totalDisplacement: 0.0,
                temperature: parseFloat(dev.temperature) || 25.0,
              });
            }
          } else {
            // scope === 'all': update all datapoints of the device without changing date time
            const [bulkCount] = await TelemetryRecord.update(
              {
                xTilt: 0.0,
                yTilt: 0.0,
                resultantTilt: 0.0,
                xDisplacement: 0.0,
                yDisplacement: 0.0,
                zDisplacement: 0.0,
                totalDisplacement: 0.0,
              },
              {
                where: {
                  [Op.or]: [
                    { deviceId: dev.id },
                    { deviceId: dev.id.toUpperCase() },
                    { deviceId: dev.id.toLowerCase() }
                  ]
                }
              }
            );
            if (bulkCount === 0 && dev.lastSeen) {
              await TelemetryRecord.create({
                deviceId: dev.id,
                timestamp: dev.lastSeen,
                xTilt: 0.0,
                yTilt: 0.0,
                resultantTilt: 0.0,
                xDisplacement: 0.0,
                yDisplacement: 0.0,
                zDisplacement: 0.0,
                totalDisplacement: 0.0,
                temperature: parseFloat(dev.temperature) || 25.0,
              });
            }
          }
        } catch (telemetryErr) {
          console.warn(`[Bulk Zero] TelemetryRecord update skipped:`, telemetryErr.message);
        }

        // Update in-memory telemetry points preserving their original timestamp/time
        if (inMemoryTelemetryStore && inMemoryTelemetryStore.has(dev.id)) {
          const hist = inMemoryTelemetryStore.get(dev.id);
          if (scope === 'last' && hist.length > 0) {
            const lastPt = hist[hist.length - 1];
            lastPt.xTilt = 0.0;
            lastPt.yTilt = 0.0;
            lastPt.resultantTilt = 0.0;
            lastPt.tiltX = 0.0;
            lastPt.tiltY = 0.0;
            lastPt.resultant = 0.0;
            lastPt.xDisplacement = 0.0;
            lastPt.yDisplacement = 0.0;
            lastPt.totalDisplacement = 0.0;
            lastPt.xDisp = 0.0;
            lastPt.yDisp = 0.0;
            lastPt.totalDisp = 0.0;
          } else {
            hist.forEach(pt => {
              pt.xTilt = 0.0;
              pt.yTilt = 0.0;
              pt.resultantTilt = 0.0;
              pt.tiltX = 0.0;
              pt.tiltY = 0.0;
              pt.resultant = 0.0;
              pt.xDisplacement = 0.0;
              pt.yDisplacement = 0.0;
              pt.totalDisplacement = 0.0;
              pt.xDisp = 0.0;
              pt.yDisp = 0.0;
              pt.totalDisp = 0.0;
            });
          }
        }

        const originalTime = dev.lastSeen ? new Date(dev.lastSeen).toISOString() : new Date().toISOString();
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
          timestamp: originalTime,
          status: dev.status,
        });
      }

      return reply.send({
        statusCode: 200,
        message: scope === 'last'
          ? `Last data point for ${updatedDeviceIds.length} device(s) updated to 0.000 without changing date/time.`
          : `All data points for ${updatedDeviceIds.length} device(s) updated to 0.000 without changing date/time.`,
        scope,
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

