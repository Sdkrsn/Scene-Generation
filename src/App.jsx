import React, { useState, useRef, useEffect } from "react";
import * as THREE from 'three';
import * as GeoTIFF from 'geotiff';
import "./App.css";

function App() {
  const [params, setParams] = useState({
    latitude: 12.9611,
    longitude: 77.6532,
    altitude: 300,
    pan: 0,
    tilt: 0,
    focalLength: 0.005,
    pixelSizeX: 0.000035,
    pixelSizeY: 0.000035,
    width: 640,
    height: 480,
    saturation: 2.5,
    sharpness: 1.0,
    roughness: 0.5,
    contrast: 1.5,
    edgeEnhancement: 1.0,
    elevationScale: 0.1
  });

  const mountRef = useRef(null);
  const [error, setError] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const sceneRef = useRef(new THREE.Scene());
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const planeRef = useRef(null);
  const parentObjectRef = useRef(null);
  const exportCameraRef = useRef(null);
  
  const centerLat = 12.9611;
  const centerLon = 77.6532;

  const handleChange = (e) => {
    const { name, value } = e.target;
    let numValue = parseFloat(value);
    
    if (name === 'altitude') {
      numValue = Math.max(0.1, numValue);
    }
    setParams(prev => ({
      ...prev,
      [name]: numValue,
    }));
  };

  const cleanWhiteMarks = (imageData, threshold = 230) => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        
        if (data[idx] > threshold && data[idx + 1] > threshold && data[idx + 2] > threshold) {
          let count = 0;
          let r = 0, g = 0, b = 0;
          
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              
              const nIdx = ((y + dy) * width + (x + dx)) * 4;
              if (data[nIdx] <= threshold || data[nIdx + 1] <= threshold || data[nIdx + 2] <= threshold) {
                r += data[nIdx];
                g += data[nIdx + 1];
                b += data[nIdx + 2];
                count++;
              }
            }
          }
          
          if (count > 0) {
            data[idx] = r / count;
            data[idx + 1] = g / count;
            data[idx + 2] = b / count;
          }
        }
      }
    }
    
    return imageData;
  };

  const generateNormalMap = (imageData, strength = 1.0) => {
    const width = imageData.width;
    const height = imageData.height;
    const normalData = new Uint8ClampedArray(width * height * 4);
    
    // Convert to grayscale first
    const grayData = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        grayData[y * width + x] = 
          (imageData.data[idx] * 0.3 + 
           imageData.data[idx + 1] * 0.59 + 
           imageData.data[idx + 2] * 0.11) / 255.0;
      }
    }
    
    // Generate normal map
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        
        // Sobel filter for normal calculation
        const x1 = (x === width - 1) ? x : x + 1;
        const x0 = (x === 0) ? x : x - 1;
        const y1 = (y === height - 1) ? y : y + 1;
        const y0 = (y === 0) ? y : y - 1;
        
        const tl = grayData[y0 * width + x0];
        const t = grayData[y0 * width + x];
        const tr = grayData[y0 * width + x1];
        const l = grayData[y * width + x0];
        const r = grayData[y * width + x1];
        const bl = grayData[y1 * width + x0];
        const b = grayData[y1 * width + x];
        const br = grayData[y1 * width + x1];
        
        const dX = (tr + 2 * r + br) - (tl + 2 * l + bl);
        const dY = (bl + 2 * b + br) - (tl + 2 * t + tr);
        const dZ = 1.0 / strength;
        
        const invLength = 1.0 / Math.sqrt(dX * dX + dY * dY + dZ * dZ);
        const nX = dX * invLength;
        const nY = dY * invLength;
        const nZ = dZ * invLength;
        
        normalData[idx] = (nX + 1.0) * 127.5;
        normalData[idx + 1] = (nY + 1.0) * 127.5;
        normalData[idx + 2] = (nZ + 1.0) * 127.5;
        normalData[idx + 3] = 255;
      }
    }
    
    return new ImageData(normalData, width, height);
  };

  const initThreeJS = () => {
    const scene = sceneRef.current;
    const mount = mountRef.current;
    
    while(scene.children.length > 0) { 
      scene.remove(scene.children[0]); 
    }
    
    const aspect = mount.clientWidth / mount.clientHeight;
    const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    camera.position.z = 5;
    cameraRef.current = camera;
    
    // Create a separate camera for exports
    const exportCamera = new THREE.PerspectiveCamera(75, params.width / params.height, 0.1, 1000);
    exportCamera.position.z = 5;
    exportCameraRef.current = exportCamera;
    
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    // Add directional light for better shading
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
    
    const parentObject = new THREE.Object3D();
    scene.add(parentObject);
    parentObjectRef.current = parentObject;
    
    const geometry = new THREE.PlaneGeometry(5, 5, 512, 512);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      roughness: params.roughness,
      metalness: 0.0,
    });
    const plane = new THREE.Mesh(geometry, material);
    plane.position.set(16, -10, 0);
    plane.scale.set(12, 10, 1);
    parentObject.add(plane);
    planeRef.current = plane; 
    
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();
  };

  const applyColorCorrection = (imageData, saturation, sharpness, contrast, edgeEnhancement) => {
    const data = imageData.data;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    tempCtx.putImageData(imageData, 0, 0);
    tempCtx.filter = `saturate(${saturation}) contrast(${contrast}) brightness(1.02)`;
    tempCtx.drawImage(tempCanvas, 0, 0);
    
    const correctedData = tempCtx.getImageData(0, 0, imageData.width, imageData.height);
    
    if (sharpness > 1 || edgeEnhancement > 1) {
      const sharpenedData = enhancedUnsharpMask(correctedData, sharpness, edgeEnhancement);
      return sharpenedData;
    }
    
    return correctedData;
  };

  const enhancedUnsharpMask = (imageData, sharpness, edgeEnhancement) => {
    const width = imageData.width;
    const height = imageData.height;
    const srcData = imageData.data;
    const dstData = new Uint8ClampedArray(srcData.length);
    
    // Edge detection kernel
    const edgeKernel = [
      [-1, -1, -1],
      [-1,  8, -1],
      [-1, -1, -1]
    ];
    
    // Sharpening kernel
    const sharpKernel = [
      [0, -0.2, 0],
      [-0.2, 1.8, -0.2],
      [0, -0.2, 0]
    ];
    
    const strength = (sharpness - 1) * 0.3;
    sharpKernel[1][1] += strength;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) {
          let sharpSum = 0;
          let edgeSum = 0;
          
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4 + c;
              const weightSharp = sharpKernel[ky + 1][kx + 1];
              const weightEdge = edgeKernel[ky + 1][kx + 1];
              sharpSum += srcData[idx] * weightSharp;
              edgeSum += srcData[idx] * weightEdge;
            }
          }
          
          const dstIdx = (y * width + x) * 4 + c;
          const edgeValue = Math.max(0, Math.min(255, edgeSum * edgeEnhancement * 0.25));
          const sharpValue = Math.max(0, Math.min(255, sharpSum));
          dstData[dstIdx] = Math.max(0, Math.min(255, sharpValue + edgeValue));
        }
        dstData[(y * width + x) * 4 + 3] = 255;
      }
    }
    
    return new ImageData(dstData, width, height);
  };

  const loadGeoTIFF = async () => {
    setLoading(true);
    setError(null);
    setImageLoaded(false);
    
    try {
      const response = await fetch("sample.tif");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
      const image = await tiff.getImage();
      const raster = await image.readRasters();
      const width = image.getWidth();
      const height = image.getHeight();
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      const imageData = ctx.createImageData(width, height);
      const data = imageData.data;
      
      if (raster.length === 1) {
        const rasterData = raster[0];
        let min = Number.MAX_VALUE;
        let max = Number.MIN_VALUE;
        for (let i = 0; i < rasterData.length; i++) {
          const val = rasterData[i];
          if (val < min) min = val;
          if (val > max) max = val;
        }
        
        const range = max - min;
        const gamma = 0.9;
        for (let i = 0; i < rasterData.length; i++) {
          const val = rasterData[i];
          let stretched = ((val - min) / range) * 255;
          stretched = Math.pow(stretched / 255, gamma) * 255;
          data[i * 4] = stretched;
          data[i * 4 + 1] = stretched;
          data[i * 4 + 2] = stretched;
          data[i * 4 + 3] = 255;
        }
      } else {
        for (let i = 0; i < data.length; i += 4) {
          data[i] = raster[0][i / 4];
          data[i + 1] = raster[1][i / 4];
          data[i + 2] = raster[2][i / 4];
          data[i + 3] = raster.length > 3 ? raster[3][i / 4] : 255;
        }
      }
      
      // Clean white marks before color correction
      const cleanedData = cleanWhiteMarks(imageData);
      
      // Generate normal map from the original data
      const normalMapData = generateNormalMap(cleanedData, params.elevationScale);
      const normalCanvas = document.createElement('canvas');
      normalCanvas.width = width;
      normalCanvas.height = height;
      const normalCtx = normalCanvas.getContext('2d');
      normalCtx.putImageData(normalMapData, 0, 0);
      
      const correctedData = applyColorCorrection(
        cleanedData,
        params.saturation,
        params.sharpness,
        params.contrast,
        params.edgeEnhancement
      );
      ctx.putImageData(correctedData, 0, 0);
      
      // Create textures
      const texture = new THREE.CanvasTexture(canvas);
      texture.anisotropy = rendererRef.current.capabilities.getMaxAnisotropy();
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.encoding = THREE.sRGBEncoding;
      
      const normalMap = new THREE.CanvasTexture(normalCanvas);
      normalMap.anisotropy = rendererRef.current.capabilities.getMaxAnisotropy();
      normalMap.minFilter = THREE.LinearMipmapLinearFilter;
      normalMap.magFilter = THREE.LinearFilter;
      normalMap.generateMipmaps = true;
      
      if (planeRef.current) {
        const aspectRatio = width / height;
        planeRef.current.geometry.dispose();
        planeRef.current.geometry = new THREE.PlaneGeometry(aspectRatio * 5, 5, 256, 256);
        
        // Update material with new properties
        planeRef.current.material.dispose();
        planeRef.current.material = new THREE.MeshStandardMaterial({
          map: texture,
          normalMap: normalMap,
          roughness: params.roughness,
          metalness: 0.0,
          side: THREE.DoubleSide,
          transparent: true
        });
        
        setImageLoaded(true);
      }
      
    } catch (err) {
      console.error("Image loading error:", err);
      setError(`Failed to load image: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const updateScene = () => {
    if (!parentObjectRef.current || !cameraRef.current) {
      setError("Three.js scene not initialized");
      return;
    }
    
    if (!imageLoaded) {
      setError("Please wait for the image to load first");
      return;
    }
    
    const { latitude, longitude, altitude, pan, tilt, focalLength, pixelSizeY, height } = params;
    
    if (latitude < 12.5 || latitude > 13.5 || longitude < 77.0 || longitude > 78.0) {
      setError("Coordinates must be within Bengaluru area");
      return;
    }
    setError(null);
    
    const latDiff = (latitude - centerLat) * 1000;
    const lonDiff = (longitude - centerLon) * 1000;
    
    const parent = parentObjectRef.current;
    parent.position.set(lonDiff, -latDiff, 0);
    
    // Reset rotation first
    parent.rotation.set(0, 0, 0);
    
    // Apply rotations in the correct order
    // First pan (Y-axis), then tilt (X-axis)
    parent.rotation.y = THREE.MathUtils.degToRad(pan);
    parent.rotation.x = THREE.MathUtils.degToRad(-tilt); // Note the negative sign here
    
    const scale = Math.pow(1100 / Math.max(altitude, 10), 0.85);
    parent.scale.set(scale, scale, scale);
    
    const sensorHeight = pixelSizeY * height;
    const fov = 2 * Math.atan(sensorHeight / (2 * focalLength)) * (180 / Math.PI);
    cameraRef.current.fov = fov;
    cameraRef.current.updateProjectionMatrix();
    
    // Also update the export camera
    if (exportCameraRef.current) {
      exportCameraRef.current.fov = fov;
      exportCameraRef.current.aspect = params.width / params.height;
      exportCameraRef.current.updateProjectionMatrix();
    }
    
    // Update material properties if they exist
    if (planeRef.current?.material) {
      planeRef.current.material.roughness = params.roughness;
      planeRef.current.material.needsUpdate = true;
    }
  };

  const exportImage = () => {
    if (!rendererRef.current || !imageLoaded || !exportCameraRef.current) {
      setError("Scene not ready for export");
      return;
    }
    
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    
    // Store original settings
    const originalSize = new THREE.Vector2();
    renderer.getSize(originalSize);
    const originalPixelRatio = renderer.getPixelRatio();
    const originalCamera = cameraRef.current;
    
    try {
      // Create a temporary canvas for high-quality export
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = params.width;
      exportCanvas.height = params.height;
      
      // Create a temporary renderer for export
      const exportRenderer = new THREE.WebGLRenderer({
        canvas: exportCanvas,
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance"
      });
      exportRenderer.setPixelRatio(1); // We'll handle scaling ourselves
      exportRenderer.setSize(params.width, params.height);
      exportRenderer.setClearColor(0x000000, 0);
      
      // Copy camera settings to export camera
      exportCameraRef.current.position.copy(originalCamera.position);
      exportCameraRef.current.rotation.copy(originalCamera.rotation);
      exportCameraRef.current.fov = originalCamera.fov;
      exportCameraRef.current.aspect = params.width / params.height;
      exportCameraRef.current.updateProjectionMatrix();
      
      // Render to the export canvas
      exportRenderer.render(scene, exportCameraRef.current);
      
      // Create download link
      const link = document.createElement('a');
      link.download = `aerial_view_${params.width}x${params.height}.png`;
      link.href = exportCanvas.toDataURL('image/png', 1.0);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (err) {
      console.error("Export error:", err);
      setError(`Failed to export image: ${err.message}`);
    } finally {
      // Restore original settings
      renderer.setPixelRatio(originalPixelRatio);
      renderer.setSize(originalSize.x, originalSize.y);
    }
  };

  useEffect(() => {
    initThreeJS();
    loadGeoTIFF();
    
    return () => {
      if (mountRef.current && rendererRef.current?.domElement) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, []);
  
  useEffect(() => {
    const handleResize = () => {
      if (rendererRef.current && mountRef.current) {
        const width = mountRef.current.clientWidth;
        const height = mountRef.current.clientHeight;
        rendererRef.current.setSize(width, height);
        cameraRef.current.aspect = width / height;
        cameraRef.current.updateProjectionMatrix();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    updateScene();
  }, [params, imageLoaded]);

  return (
    <div className="app-container">
      <h1>Enhanced Aerial Image Viewer</h1>
      
      <div className="main-container">
        <div className="left-section">
          <fieldset className="parameter-group">
            <legend>Camera Intrinsic Parameters</legend>
            
            <div className="input-group">
              <label htmlFor="focalLength">Focal Length (m):</label>
              <input
                type="number"
                id="focalLength"
                name="focalLength"
                value={params.focalLength}
                onChange={handleChange}
                step="0.0001"
              />
            </div>
            
            <div className="input-group horizontal">
              <div>
                <label htmlFor="pixelSizeX">Pixel Size X (m):</label>
                <input
                  type="number"
                  id="pixelSizeX"
                  name="pixelSizeX"
                  value={params.pixelSizeX}
                  onChange={handleChange}
                  step="0.0000001"
                />
              </div>
              <div>
                <label htmlFor="pixelSizeY">Pixel Size Y (m):</label>
                <input
                  type="number"
                  id="pixelSizeY"
                  name="pixelSizeY"
                  value={params.pixelSizeY}
                  onChange={handleChange}
                  step="0.0000001"
                />
              </div>
            </div>
            
            <div className="input-group horizontal">
              <div>
                <label htmlFor="width">Image Width (px):</label>
                <input
                  type="number"
                  id="width"
                  name="width"
                  value={params.width}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label htmlFor="height">Image Height (px):</label>
                <input
                  type="number"
                  id="height"
                  name="height"
                  value={params.height}
                  onChange={handleChange}
                />
              </div>
            </div>
          </fieldset>
          
          <fieldset className="parameter-group">
            <legend>Camera Extrinsic Parameters</legend>
            
            <div className="input-group">
              <label htmlFor="pan">Pan (deg):</label>
              <input
                type="number"
                id="pan"
                name="pan"
                value={params.pan}
                onChange={handleChange}
                min="0"
                max="359"
              />
            </div>
            
            <div className="input-group">
              <label htmlFor="tilt">Tilt (deg):</label>
              <input
                type="number"
                id="tilt"
                name="tilt"
                value={params.tilt}
                onChange={handleChange}
                min="-45"
                max="45"
              />
            </div>
            
            <div className="input-group">
              <label htmlFor="latitude">Latitude (deg):</label>
              <input
                type="number"
                id="latitude"
                name="latitude"
                value={params.latitude}
                onChange={handleChange}
                step="0.0001"
              />
            </div>
            
            <div className="input-group">
              <label htmlFor="longitude">Longitude (deg):</label>
              <input
                type="number"
                id="longitude"
                name="longitude"
                value={params.longitude}
                onChange={handleChange}
                step="0.0001"
              />
            </div>
            
            <div className="input-group">
              <label htmlFor="altitude">Altitude (m):</label>
              <input
                type="number"
                id="altitude"
                name="altitude"
                value={params.altitude}
                onChange={handleChange}
                min="0.1"
              />
            </div>
          </fieldset>
        </div>
        
        <div className="right-section">
          <fieldset className="camera-view">
            <legend>Camera View</legend>
            
            {loading && <div className="loading-message">Loading image...</div>}
            {error && <div className="error-message">{error}</div>}
            
            <div className="canvas-container" ref={mountRef}></div>
            
            <div className="button-container">
              <button onClick={exportImage} disabled={loading || !imageLoaded}>
                Export HD Image
              </button>
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  );
}

export default App;