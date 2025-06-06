import React, { useState, useRef, useEffect } from "react";
import * as THREE from 'three';
import * as GeoTIFF from 'geotiff';
import "./App.css";

function App() {
  const [params, setParams] = useState({
    latitude: 12.9589,
    longitude: 77.6464,
    altitude: 300,
    pan: 0,
    tilt: 0,
    focalLength: 0.005,
    pixelSizeX: 0.000035,
    pixelSizeY: 0.000035,
    width: 640,
    height: 480,
    saturation: 2.5,
    sharpness: 1.2,
    roughness: 0.1,
    contrast: 1.3,
    curvature: 1.9,
    brightness: 0.7, // Added brightness parameter
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
  const blackPlaneRef = useRef(null);
  
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

  const applyCurvature = (plane, curvature) => {
    if (!plane || !plane.geometry) return;
    
    const position = plane.geometry.attributes.position;
    const originalPositions = position.array.slice();
    
    const earthRadius = 6371000 / 1000;
    
    for (let i = 0; i < position.count; i++) {
      const x = originalPositions[i * 3];
      const y = originalPositions[i * 3 + 1];
      const distance = Math.sqrt(x * x + y * y);
      const curvatureEffect = curvature * (distance * distance) / (2 * earthRadius);
      position.setZ(i, -curvatureEffect);
    }
    
    position.needsUpdate = true;
    plane.geometry.computeVertexNormals();
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

  const initThreeJS = () => {
    const scene = sceneRef.current;
    const mount = mountRef.current;
    
    if (rendererRef.current && mount.contains(rendererRef.current.domElement)) {
      mount.removeChild(rendererRef.current.domElement);
    }
    
    while(scene.children.length > 0) { 
      scene.remove(scene.children[0]); 
    }
    
    const aspect = mount.clientWidth / mount.clientHeight;
    const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    camera.position.z = 5;
    cameraRef.current = camera;
    
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
    
    // Create black plane that covers the entire view when altitude > 2850m
    const blackGeometry = new THREE.PlaneGeometry(20, 20);
    const blackMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x000000,
      transparent: false
    });
    const blackPlane = new THREE.Mesh(blackGeometry, blackMaterial);
    blackPlane.position.z = 0.1; // Slightly in front of other objects
    blackPlane.scale.set(100,100,1);
    blackPlane.visible = params.altitude > 2850;
    scene.add(blackPlane);
    blackPlaneRef.current = blackPlane;
    
    const parentObject = new THREE.Object3D();
    scene.add(parentObject);
    parentObjectRef.current = parentObject;
    
    const geometry = new THREE.PlaneGeometry(5, 5, 512, 512);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const plane = new THREE.Mesh(geometry, material);
    plane.position.set(16, -10, 0);
    plane.scale.set(12, 10, 1);
    parentObject.add(plane);
    planeRef.current = plane;
    
    applyCurvature(plane, params.curvature);
    
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();
  };

  const applyColorCorrection = (imageData, saturation, sharpness, contrast, roughness, brightness) => {
    const data = imageData.data;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    if (roughness > 0) {
      const roughnessData = applyRoughness(imageData, roughness);
      tempCtx.putImageData(roughnessData, 0, 0);
    } else {
      tempCtx.putImageData(imageData, 0, 0);
    }
    
    tempCtx.filter = `saturate(${saturation}) contrast(${contrast}) brightness(${brightness})`;
    tempCtx.drawImage(tempCanvas, 0, 0);
    
    const correctedData = tempCtx.getImageData(0, 0, imageData.width, imageData.height);
    
    if (sharpness > 1) {
      const sharpenedData = unsharpMask(correctedData, sharpness);
      return sharpenedData;
    }
    
    return correctedData;
  };

  const applyRoughness = (imageData, amount) => {
    const width = imageData.width;
    const height = imageData.height;
    const data = new Uint8ClampedArray(imageData.data);
    const roughnessIntensity = amount * 10;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const noise = (Math.random() - 0.5) * roughnessIntensity;
        
        for (let c = 0; c < 3; c++) {
          data[idx + c] = Math.max(0, Math.min(255, data[idx + c] + noise));
        }
      }
    }
    
    return new ImageData(data, width, height);
  };

  const unsharpMask = (imageData, amount) => {
    const width = imageData.width;
    const height = imageData.height;
    const srcData = imageData.data;
    const dstData = new Uint8ClampedArray(srcData.length);
    
    const kernel = [
      [0, -0.2, 0],
      [-0.2, 1.8, -0.2],
      [0, -0.2, 0]
    ];
    
    const strength = (amount - 1) * 0.3;
    kernel[1][1] += strength;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4 + c;
              const weight = kernel[ky + 1][kx + 1];
              sum += srcData[idx] * weight;
            }
          }
          const dstIdx = (y * width + x) * 4 + c;
          dstData[dstIdx] = Math.max(0, Math.min(255, sum));
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
      
      const cleanedData = cleanWhiteMarks(imageData);
      
      const correctedData = applyColorCorrection(
        cleanedData,
        params.saturation,
        params.sharpness,
        params.contrast,
        params.roughness,
        params.brightness
      );
      ctx.putImageData(correctedData, 0, 0);
      
      const texture = new THREE.CanvasTexture(canvas);
      texture.anisotropy = rendererRef.current.capabilities.getMaxAnisotropy();
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.encoding = THREE.sRGBEncoding;
      
      if (planeRef.current) {
        const aspectRatio = width / height;
        planeRef.current.geometry.dispose();
        planeRef.current.geometry = new THREE.PlaneGeometry(aspectRatio * 5, 5, 256, 256);
        planeRef.current.material.map = texture;
        planeRef.current.material.needsUpdate = true;
        
        applyCurvature(planeRef.current, params.curvature);
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
    if (!parentObjectRef.current || !cameraRef.current || !blackPlaneRef.current) {
      return;
    }
    
    // Update black plane visibility based on altitude (changed to 2850)
    blackPlaneRef.current.visible = params.altitude > 2850;
    
    // If altitude is over 2850m, we don't need to update the rest of the scene
    if (params.altitude > 2850) {
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
    
    parent.rotation.set(0, 0, 0);
    parent.rotation.y = THREE.MathUtils.degToRad(pan);
    parent.rotation.x = THREE.MathUtils.degToRad(-tilt);
    
    const scale = Math.pow(1100 / Math.max(altitude, 10), 0.85);
    parent.scale.set(scale, scale, scale);
    
    const sensorHeight = pixelSizeY * height;
    const fov = 2 * Math.atan(sensorHeight / (2 * focalLength)) * (180 / Math.PI);
    cameraRef.current.fov = fov;
    cameraRef.current.updateProjectionMatrix();
    
    if (exportCameraRef.current) {
      exportCameraRef.current.fov = fov;
      exportCameraRef.current.aspect = params.width / params.height;
      exportCameraRef.current.updateProjectionMatrix();
    }
    
    if (planeRef.current) {
      applyCurvature(planeRef.current, params.curvature);
    }
  };

  const exportImage = () => {
    if (!rendererRef.current || !imageLoaded || !exportCameraRef.current) {
      setError("Scene not ready for export");
      return;
    }
    
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    
    const originalSize = new THREE.Vector2();
    renderer.getSize(originalSize);
    const originalPixelRatio = renderer.getPixelRatio();
    const originalCamera = cameraRef.current;
    
    try {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = params.width;
      exportCanvas.height = params.height;
      
      const exportRenderer = new THREE.WebGLRenderer({
        canvas: exportCanvas,
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance"
      });
      exportRenderer.setPixelRatio(1);
      exportRenderer.setSize(params.width, params.height);
      exportRenderer.setClearColor(0x000000, 0);
      
      exportCameraRef.current.position.copy(originalCamera.position);
      exportCameraRef.current.rotation.copy(originalCamera.rotation);
      exportCameraRef.current.fov = originalCamera.fov;
      exportCameraRef.current.aspect = params.width / params.height;
      exportCameraRef.current.updateProjectionMatrix();
      
      exportRenderer.render(scene, exportCameraRef.current);
      
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