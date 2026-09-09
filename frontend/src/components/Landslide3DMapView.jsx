import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Layers, RotateCcw, Play, Pause, AlertTriangle, ShieldCheck,
  Eye, EyeOff, ZoomIn, ZoomOut, Compass, Navigation, Maximize2,
  Info, Cpu, ArrowUpRight, Activity, Battery, Signal, Zap, Shield, Radio,
  Minimize2, Globe
} from 'lucide-react';
import { getAssetTypeConfig, getDisplacementStatus } from './AssetsMapView';

// Helper to generate a realistic Satellite Aerial Orthophoto Texture Canvas
function createSatelliteTerrainTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // 1. Base Earth / Forest Satellite Tone
  const gradient = ctx.createLinearGradient(0, 0, 0, 1024);
  gradient.addColorStop(0, '#1c2826');   // Toe valley (deep green/dark forest)
  gradient.addColorStop(0.3, '#2d4a22'); // Lower slope forest
  gradient.addColorStop(0.6, '#556b2f'); // Mid slope olive vegetation
  gradient.addColorStop(0.85, '#6b7280'); // Upper rocky escarpment
  gradient.addColorStop(1, '#9ca3af');   // Ridge peak granite / bare rock
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 1024);

  // 2. Add realistic satellite photogrammetry noise & canopy speckles
  for (let i = 0; i < 40000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const r = Math.random() * 2.5 + 0.5;
    const isForest = y < 700;
    ctx.fillStyle = isForest
      ? `rgba(${20 + Math.random() * 40}, ${50 + Math.random() * 60}, ${20 + Math.random() * 30}, 0.25)`
      : `rgba(${120 + Math.random() * 50}, ${110 + Math.random() * 40}, ${100 + Math.random() * 40}, 0.2)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Landslide Failure / Exposed Soil Scarp in center
  const scarpGrad = ctx.createRadialGradient(512, 530, 20, 512, 530, 240);
  scarpGrad.addColorStop(0, 'rgba(180, 130, 90, 0.75)'); // Exposed reddish loam / clay
  scarpGrad.addColorStop(0.5, 'rgba(140, 100, 70, 0.45)');
  scarpGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = scarpGrad;
  ctx.beginPath();
  ctx.ellipse(512, 530, 260, 200, -0.1, 0, Math.PI * 2);
  ctx.fill();

  // 4. Contour Access Roads / Drainage Lines
  ctx.strokeStyle = 'rgba(210, 190, 160, 0.4)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(100, 250);
  ctx.bezierCurveTo(350, 280, 650, 220, 920, 270);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(80, 750);
  ctx.bezierCurveTo(400, 720, 600, 800, 950, 760);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export default function Landslide3DMapView({
  structures = [],
  devices = [],
  sites = [],
  selectedStructure = null,
  onSelectStructure = () => {},
  onSelectDevice = () => {}
}) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const animationFrameRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const satelliteTextureRef = useRef(null);

  const [colorMode, setColorMode] = useState('SATELLITE'); // 'SATELLITE', 'HEATMAP', or 'ASSET_TYPE'
  const [showVectors, setShowVectors] = useState(true);
  const [showGeofences, setShowGeofences] = useState(true);
  const [isSimulating, setIsSimulating] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [cameraPreset, setCameraPreset] = useState('perspective'); // 'perspective', 'top', 'crossSection'
  const [simulationSpeed, setSimulationSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Initialize Three.js Scene
  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 550;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070c18);
    scene.fog = new THREE.FogExp2(0x070c18, 0.005);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
    camera.position.set(65, 45, 75);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild);
    }
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 15;
    controls.maxDistance = 220;
    controls.target.set(0, 6, 0);
    controlsRef.current = controls;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.5);
    sunLight.position.set(60, 85, 40);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 250;
    sunLight.shadow.camera.left = -60;
    sunLight.shadow.camera.right = 60;
    sunLight.shadow.camera.top = 60;
    sunLight.shadow.camera.bottom = -60;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0x60a5fa, 0x1e293b, 0.5);
    scene.add(hemiLight);

    // 6. Generate Satellite Texture
    satelliteTextureRef.current = createSatelliteTerrainTexture();

    // 7. Build 3D Landslide Slope Terrain Mesh
    buildTerrain(scene, colorMode);

    // 8. Render Loop
    let clock = new THREE.Clock();
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      controls.update();

      const dynamicGroup = scene.getObjectByName('dynamicGroup');
      if (dynamicGroup) {
        dynamicGroup.traverse((child) => {
          if (child.userData?.isVector && isSimulating) {
            const wave = Math.sin(elapsed * 3 * simulationSpeed + child.userData.offset) * 0.15;
            child.position.y = child.userData.baseY + wave;
          }
          if (child.userData?.isPulse) {
            const scale = 1 + Math.sin(elapsed * 4 + child.userData.offset) * 0.2;
            child.scale.set(scale, scale, scale);
          }
          if (child.userData?.isGeofence) {
            child.material.opacity = 0.24 + Math.sin(elapsed * 2) * 0.08;
          }
        });
      }

      renderer.render(scene, camera);
    };
    animate();

    // 9. ResizeObserver for accurate sizing
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth || 800;
      const h = containerRef.current.clientHeight || 550;
      if (w > 0 && h > 0) {
        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(w, h);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(containerRef.current);
    resizeObserverRef.current = resizeObserver;
    window.addEventListener('resize', handleResize);

    setTimeout(handleResize, 100);

    // 10. Click Raycaster
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleCanvasClick = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const interactiveObjects = [];
      scene.traverse((obj) => {
        if (obj.userData?.clickable) interactiveObjects.push(obj);
      });

      const intersects = raycaster.intersectObjects(interactiveObjects, true);
      if (intersects.length > 0) {
        let hitObj = intersects[0].object;
        while (hitObj && !hitObj.userData?.data && hitObj.parent) {
          hitObj = hitObj.parent;
        }
        if (hitObj?.userData?.data) {
          const data = hitObj.userData.data;
          setSelectedItem({
            ...data,
            nodeType: hitObj.userData.type,
          });
          if (hitObj.userData.type === 'STRUCTURE') {
            onSelectStructure(data);
          } else {
            onSelectDevice(data);
          }
        }
      }
    };

    renderer.domElement.addEventListener('click', handleCanvasClick);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      renderer.domElement.removeEventListener('click', handleCanvasClick);
      cancelAnimationFrame(animationFrameRef.current);
      if (rendererRef.current && rendererRef.current.domElement) {
        rendererRef.current.dispose();
      }
    };
  }, []);

  // Function to build / re-color the 3D terrain
  const buildTerrain = (scene, currentMode) => {
    const prevTerrain = scene.getObjectByName('terrainMesh');
    if (prevTerrain) scene.remove(prevTerrain);

    const terrainSize = 120;
    const segments = 100;
    const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.attributes.position;
    const colors = [];
    const color = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      const normalizedZ = (z + terrainSize / 2) / terrainSize;
      let height = Math.pow(normalizedZ, 1.8) * 32;
      height += Math.sin(x * 0.08) * 3.5 + Math.cos(z * 0.06) * 2.8;

      const centerDist = Math.sqrt(Math.pow(x, 2) + Math.pow(z + 5, 2));
      if (centerDist < 26) {
        const scarpDepth = Math.cos((centerDist / 26) * Math.PI * 0.5) * 5.2;
        height -= scarpDepth;
      }
      height += (Math.sin(x * 0.3) * Math.cos(z * 0.3)) * 0.4;
      pos.setY(i, height);

      // Vertex color heatmap if in HEATMAP mode
      const slipRisk = Math.max(0, 1 - (centerDist / 28));
      if (slipRisk > 0.6) {
        color.setRGB(0.92, 0.22, 0.25);
      } else if (slipRisk > 0.3) {
        color.setRGB(0.95, 0.65, 0.15);
      } else if (height > 20) {
        color.setRGB(0.35, 0.40, 0.48);
      } else if (height > 8) {
        color.setRGB(0.18, 0.38, 0.28);
      } else {
        color.setRGB(0.12, 0.26, 0.18);
      }
      colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const isSat = currentMode === 'SATELLITE';
    const material = new THREE.MeshStandardMaterial({
      map: isSat ? (satelliteTextureRef.current || null) : null,
      vertexColors: !isSat,
      roughness: 0.85,
      metalness: 0.1,
      flatShading: false,
    });

    const terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.name = 'terrainMesh';
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    // Geological Strata Bedrock Block under the slope
    const strataGeom = new THREE.BoxGeometry(terrainSize, 12, terrainSize);
    const strataMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.9,
      metalness: 0.2
    });
    const strataMesh = new THREE.Mesh(strataGeom, strataMat);
    strataMesh.position.y = -6;
    strataMesh.name = 'strataMesh';
    strataMesh.receiveShadow = true;
    scene.add(strataMesh);

    // Grid lines
    const prevGrid = scene.getObjectByName('gridMesh');
    if (prevGrid) scene.remove(prevGrid);
    const grid = new THREE.GridHelper(terrainSize, 24, 0x38bdf8, 0x1e293b);
    grid.position.y = -0.05;
    grid.name = 'gridMesh';
    scene.add(grid);
  };

  // Re-run terrain builder when colorMode changes
  useEffect(() => {
    if (sceneRef.current) {
      buildTerrain(sceneRef.current, colorMode);
    }
  }, [colorMode]);

  // Populate Structures & Devices onto 3D slope surface
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const prevGroup = scene.getObjectByName('dynamicGroup');
    if (prevGroup) scene.remove(prevGroup);

    const dynamicGroup = new THREE.Group();
    dynamicGroup.name = 'dynamicGroup';
    scene.add(dynamicGroup);

    const hasStructures = structures && structures.length > 0;
    const structList = hasStructures ? structures : [
      { id: 'ASSET-001', name: 'Hill Slope Barrier Sector A', type: 'Slope Barrier', heightElevation: 18, Devices: [] },
      { id: 'ASSET-002', name: 'Retaining Wall Block 01', type: 'Retaining Wall', heightElevation: 12, Devices: [] }
    ];

    // Render physical structures
    structList.forEach((st, idx) => {
      const typeConfig = getAssetTypeConfig(st.type);
      const attachedDevs = (st.Devices && st.Devices.length > 0)
        ? st.Devices
        : (devices.filter(d => d.structureId === st.id) || []);

      const maxDisp = attachedDevs.reduce((acc, d) => Math.max(acc, d.totalDisplacement || 1.2), 1.2);
      const risk = getDisplacementStatus(maxDisp);

      const posX = -26 + (idx * 24);
      const posZ = -12 + (idx % 3) * 16;
      const normalizedZ = (posZ + 60) / 120;
      const posY = Math.pow(normalizedZ, 1.8) * 32 + (Math.sin(posX * 0.08) * 3.5);

      const colorHex = colorMode === 'HEATMAP'
        ? parseInt(risk.color.replace('#', '0x'))
        : parseInt(typeConfig.color.replace('#', '0x'));

      const assetGroup = new THREE.Group();
      assetGroup.position.set(posX, posY, posZ);
      assetGroup.userData = { clickable: true, type: 'STRUCTURE', data: { ...st, Devices: attachedDevs, maxDisplacement: maxDisp } };

      if (st.type === 'Retaining Wall') {
        const wallGeom = new THREE.BoxGeometry(18, 7, 2.5);
        const wallMat = new THREE.MeshStandardMaterial({
          color: colorHex,
          roughness: 0.6,
          metalness: 0.2
        });
        const wallMesh = new THREE.Mesh(wallGeom, wallMat);
        wallMesh.position.y = 3.5;
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        assetGroup.add(wallMesh);
      } else if (st.type === 'Slope Barrier' || st.type === 'Crash Barrier') {
        for (let p = -8; p <= 8; p += 4) {
          const postGeom = new THREE.CylinderGeometry(0.25, 0.25, 6, 8);
          const postMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.3 });
          const post = new THREE.Mesh(postGeom, postMat);
          post.position.set(p, 3, 0);
          post.castShadow = true;
          assetGroup.add(post);
        }
        const netGeom = new THREE.PlaneGeometry(17, 4.5);
        const netMat = new THREE.MeshStandardMaterial({
          color: colorHex,
          wireframe: true,
          side: THREE.DoubleSide
        });
        const net = new THREE.Mesh(netGeom, netMat);
        net.position.y = 3.5;
        assetGroup.add(net);
      } else {
        const boxGeom = new THREE.BoxGeometry(12, 4, 3);
        const boxMat = new THREE.MeshStandardMaterial({ color: colorHex });
        const box = new THREE.Mesh(boxGeom, boxMat);
        box.position.y = 2;
        assetGroup.add(box);
      }

      if (showGeofences) {
        const fenceGeom = new THREE.CylinderGeometry(9, 9, 3, 16, 1, true);
        const fenceMat = new THREE.MeshBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: 0.24,
          side: THREE.DoubleSide,
          wireframe: true,
        });
        const fenceMesh = new THREE.Mesh(fenceGeom, fenceMat);
        fenceMesh.position.y = 1.5;
        fenceMesh.userData = { isGeofence: true };
        assetGroup.add(fenceMesh);
      }

      const pinGeom = new THREE.SphereGeometry(1.0, 16, 16);
      const pinMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.6,
        roughness: 0.2
      });
      const pin = new THREE.Mesh(pinGeom, pinMat);
      pin.position.y = 9;
      pin.castShadow = true;
      pin.userData = { isPulse: true, offset: idx };
      assetGroup.add(pin);

      const mastGeom = new THREE.CylinderGeometry(0.08, 0.08, 9, 8);
      const mastMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const mast = new THREE.Mesh(mastGeom, mastMat);
      mast.position.y = 4.5;
      assetGroup.add(mast);

      if (showVectors) {
        const dir = new THREE.Vector3(
          (Math.sin(idx * 2) * 0.4),
          -0.3,
          0.9
        ).normalize();

        const arrowLength = Math.max(3, Math.min(10, maxDisp * 0.45));
        const arrowHelper = new THREE.ArrowHelper(dir, new THREE.Vector3(0, 4.5, 0), arrowLength, colorHex, 1.4, 0.8);
        arrowHelper.userData = { isVector: true, baseY: 4.5, offset: idx };
        assetGroup.add(arrowHelper);
      }

      dynamicGroup.add(assetGroup);
    });

    // Render all devices on the 3D terrain
    const allDevsToRender = (devices && devices.length > 0)
      ? devices
      : [
          { id: 'TM-001', name: 'Node S1', totalDisplacement: 16.8, xDisplacement: 12.4, yDisplacement: 11.3, resultantTilt: 2.8, xTilt: 1.9, yTilt: 2.0, status: 'ONLINE', battery: '95%', signal: '88%' },
          { id: 'TM-002', name: 'Node RW1', totalDisplacement: 3.4, xDisplacement: 1.2, yDisplacement: 3.1, resultantTilt: 0.6, xTilt: 0.3, yTilt: 0.5, status: 'ONLINE', battery: '100%', signal: '92%' },
          { id: 'TM-003', name: 'Node CB1', totalDisplacement: 7.2, xDisplacement: 4.5, yDisplacement: 5.6, resultantTilt: 1.4, xTilt: 0.9, yTilt: 1.1, status: 'ONLINE', battery: '89%', signal: '80%' }
        ];

    allDevsToRender.forEach((dev, dIdx) => {
      const devCount = allDevsToRender.length;
      const angle = (dIdx / Math.max(1, devCount)) * Math.PI * 1.5 - Math.PI * 0.75;
      const radius = 18 + (dIdx % 3) * 8;
      const devX = Math.cos(angle) * radius;
      const devZ = Math.sin(angle) * (radius * 0.7) - 5;
      const normZ = (devZ + 60) / 120;
      const devY = Math.pow(normZ, 1.8) * 32 + (Math.sin(devX * 0.08) * 3.5);

      const devGroup = new THREE.Group();
      devGroup.position.set(devX, devY, devZ);
      devGroup.userData = {
        clickable: true,
        type: 'DEVICE',
        data: {
          ...dev,
          xDisplacement: dev.xDisplacement !== undefined ? dev.xDisplacement : 1.2,
          yDisplacement: dev.yDisplacement !== undefined ? dev.yDisplacement : 2.5,
          totalDisplacement: dev.totalDisplacement !== undefined ? dev.totalDisplacement : (dev.displacement?.totalDisplacement_mm || 2.8),
          xTilt: dev.xTilt !== undefined ? dev.xTilt : 0.8,
          yTilt: dev.yTilt !== undefined ? dev.yTilt : 1.2,
          resultantTilt: dev.resultantTilt !== undefined ? dev.resultantTilt : (dev.tilt?.tilt || 1.4),
        }
      };

      const sensorGeom = new THREE.BoxGeometry(2.0, 1.2, 1.6);
      const sensorMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.9,
        roughness: 0.2
      });
      const sensorMesh = new THREE.Mesh(sensorGeom, sensorMat);
      sensorMesh.castShadow = true;
      devGroup.add(sensorMesh);

      const isOnline = (dev.status || 'ONLINE') === 'ONLINE';
      const ledGeom = new THREE.SphereGeometry(0.3, 8, 8);
      const ledMat = new THREE.MeshBasicMaterial({ color: isOnline ? 0x34d399 : 0xfbbf24 });
      const led = new THREE.Mesh(ledGeom, ledMat);
      led.position.set(0, 0.7, 0.4);
      devGroup.add(led);

      const antGeom = new THREE.CylinderGeometry(0.06, 0.06, 2.5, 6);
      const antMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8 });
      const ant = new THREE.Mesh(antGeom, antMat);
      ant.position.set(0.6, 1.6, 0);
      devGroup.add(ant);

      const beaconGeom = new THREE.RingGeometry(0.8, 1.4, 16);
      beaconGeom.rotateX(-Math.PI / 2);
      const beaconMat = new THREE.MeshBasicMaterial({
        color: isOnline ? 0x38bdf8 : 0xf59e0b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6
      });
      const beacon = new THREE.Mesh(beaconGeom, beaconMat);
      beacon.position.y = 0.1;
      beacon.userData = { isPulse: true, offset: dIdx };
      devGroup.add(beacon);

      dynamicGroup.add(devGroup);
    });

  }, [structures, devices, colorMode, showVectors, showGeofences]);

  const setViewPreset = (preset) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    setCameraPreset(preset);

    if (preset === 'top') {
      camera.position.set(0, 110, 5);
      controls.target.set(0, 5, 0);
    } else if (preset === 'crossSection') {
      camera.position.set(95, 20, 0);
      controls.target.set(0, 15, 0);
    } else {
      camera.position.set(65, 45, 75);
      controls.target.set(0, 5, 0);
    }
    controls.update();
  };

  const resetCamera = () => {
    setViewPreset('perspective');
  };

  return (
    <div className={`flex flex-col rounded-2xl border border-slate-200 bg-slate-950 overflow-hidden shadow-2xl relative text-white ${
      isFullscreen ? 'fixed inset-0 z-50 h-screen rounded-none' : 'h-[calc(100vh-230px)] min-h-[580px]'
    }`}>
      {/* Top 3D Control Toolbar */}
      <div className="p-3 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md flex flex-wrap items-center justify-between gap-2.5 z-20 text-xs">
        {/* Left: 3D Camera Angles & Presets */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setViewPreset('perspective')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              cameraPreset === 'perspective' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            3D Perspective
          </button>
          <button
            onClick={() => setViewPreset('crossSection')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              cameraPreset === 'crossSection' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            Slope Cross-Section
          </button>
          <button
            onClick={() => setViewPreset('top')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              cameraPreset === 'top' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            Topographic
          </button>
        </div>

        {/* Center: Satellite 3D vs Heatmap Switcher */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setColorMode('SATELLITE')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                colorMode === 'SATELLITE' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>3D Satellite Aerial</span>
            </button>
            <button
              onClick={() => setColorMode('HEATMAP')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                colorMode === 'HEATMAP' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>3D Displacement Heatmap</span>
            </button>
          </div>

          <button
            onClick={() => setShowVectors(!showVectors)}
            className={`px-2.5 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              showVectors ? 'bg-purple-950/70 text-purple-300 border-purple-600/60' : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
            title="Toggle Displacement Vector Arrows"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Vectors</span>
          </button>

          <button
            onClick={() => setShowGeofences(!showGeofences)}
            className={`px-2.5 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              showGeofences ? 'bg-emerald-950/70 text-emerald-300 border-emerald-600/60' : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
            title="Toggle 3D Area Coverage Geofence Cylinders"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>3D Geofence</span>
          </button>
        </div>

        {/* Right: Simulation Controls, Reset & Fullscreen */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsSimulating(!isSimulating)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-bold transition-all cursor-pointer ${
              isSimulating ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isSimulating ? 'Sim Active' : 'Sim Paused'}</span>
          </button>

          <button
            onClick={resetCamera}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700 cursor-pointer"
            title="Reset 3D Camera View"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700 cursor-pointer"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main 3D Canvas Viewport */}
      <div className="flex-1 w-full h-full relative overflow-hidden">
        <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Top-Left Floating Landslide Live Status HUD */}
        <div className="absolute left-4 top-4 z-10 p-3 rounded-2xl bg-slate-900/80 backdrop-blur-md border border-slate-800/80 space-y-1.5 pointer-events-none">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-300">
              {colorMode === 'SATELLITE' ? '3D Satellite Aerial Terrain' : '3D Landslide Displacement Heatmap'}
            </span>
          </div>
          <div className="text-xs font-mono text-slate-400">
            DEM Resolution: <span className="text-cyan-400 font-bold">10,000 pts</span> &bull; 60 FPS
          </div>
          <div className="text-[10px] text-slate-500">
            Click & drag to rotate 360° &bull; Right-click to pan &bull; Scroll to zoom
          </div>
        </div>

        {/* Bottom Floating Legend Bar */}
        <div className="absolute left-4 bottom-4 z-10 p-2.5 rounded-2xl bg-slate-900/85 backdrop-blur-md border border-slate-800 flex items-center gap-3 text-[11px] font-bold">
          <span className="text-slate-400 text-[10px] uppercase font-mono">Displacement Risk:</span>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/50" />
            <span className="text-emerald-300">Stable (&lt;5mm)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500 shadow-xs shadow-amber-500/50" />
            <span className="text-amber-300">Creep Active (5-15mm)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-600 shadow-xs shadow-rose-600/50 animate-pulse" />
            <span className="text-rose-300">Landslide Risk (&gt;15mm)</span>
          </div>
        </div>

        {/* Selected 3D Inclinometer / Asset Inspector Drawer */}
        {selectedItem && (
          <div className="absolute right-4 top-4 bottom-4 w-84 bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl p-4 flex flex-col justify-between z-20 animate-fadeIn text-xs overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold">
                    {selectedItem.nodeType === 'DEVICE' ? <Cpu className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {selectedItem.nodeType === 'DEVICE' ? 'INCLINOMETER HARDWARE SENSOR' : 'STRUCTURAL ASSET 3D NODE'}
                    </div>
                    <div className="font-bold text-white text-sm truncate max-w-[190px]">
                      {selectedItem.name || selectedItem.id}
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelectedItem(null)} className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer">
                  &times;
                </button>
              </div>

              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">Identifier:</span>
                    <span className="font-bold text-white">{selectedItem.id || selectedItem.code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">Type:</span>
                    <span className="font-bold text-cyan-400">{selectedItem.type || selectedItem.structureType || 'Inclinometer'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">Status:</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 font-bold text-[10px]">
                      {selectedItem.status || 'ONLINE'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-800/40 space-y-2">
                  <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                    Geotechnical Displacement Metrics (mm)
                  </div>
                  <div className="text-2xl font-black font-mono text-white">
                    Δ {Number(selectedItem.totalDisplacement || selectedItem.maxDisplacement || 16.8).toFixed(2)} mm
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-blue-900/40 font-mono text-[11px]">
                    <div>
                      <span className="text-slate-400 text-[10px] block">ΔX (Roll Disp):</span>
                      <span className="text-cyan-300 font-bold">{Number(selectedItem.xDisplacement || 12.4).toFixed(2)} mm</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">ΔY (Pitch Disp):</span>
                      <span className="text-amber-300 font-bold">{Number(selectedItem.yDisplacement || 11.3).toFixed(2)} mm</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-800/40 space-y-2">
                  <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                    Inclinometer Vector Tilt (Degrees °)
                  </div>
                  <div className="text-xl font-bold font-mono text-white">
                    θ {Number(selectedItem.resultantTilt || 2.4).toFixed(2)}°
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-purple-900/40 font-mono text-[11px]">
                    <div>
                      <span className="text-slate-400 text-[10px] block">θX (Roll Tilt):</span>
                      <span className="text-purple-300 font-bold">{Number(selectedItem.xTilt || 1.9).toFixed(2)}°</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">θY (Pitch Tilt):</span>
                      <span className="text-pink-300 font-bold">{Number(selectedItem.yTilt || 2.0).toFixed(2)}°</span>
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between font-mono text-xs">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                    <Zap className="w-3.5 h-3.5" />
                    <span>{selectedItem.battery || '95%'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-blue-400 font-bold">
                    <Radio className="w-3.5 h-3.5" />
                    <span>{selectedItem.signal || '88%'}</span>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedItem(null)}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer mt-3"
            >
              Close Inspector
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
