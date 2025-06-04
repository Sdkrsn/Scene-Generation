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
    saturation: 2.9,
    sharpness: 1.0,
  });

  const mountRef = useRef(null);
  const [error, setError] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Three.js objects
  const sceneRef = useRef(new THREE.Scene());
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const planeRef = useRef(null);
  const parentObjectRef = useRef(null);
  const skyRef = useRef(null);
  
  // Center coordinates
  const centerLat = 12.9611;
  const centerLon = 77.6532;

  const handleChange = (e) => {
    const { name, value } = e.target;
    let numValue = parseFloat(value);
    
    // Add parameter-specific validation
    if (name === 'altitude') {
      numValue = Math.max(0.1, numValue);
    }
    setParams(prev => ({
      ...prev,
      [name]: numValue,
    }));
  };

  // Initialize Three.js scene
  const initThreeJS = () => {
    const scene = sceneRef.current;
    const mount = mountRef.current;
    
    // Clear previous scene
    while(scene.children.length > 0) { 
      scene.remove(scene.children[0]); 
    }
    
    // Camera setup
    const aspect = mount.clientWidth / mount.clientHeight;
    const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    camera.position.z = 5;
    cameraRef.current = camera;
    
    // Renderer setup with enhanced settings
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
    
    // Sky with gradient for more realistic look
    const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
    const skyMaterial = new THREE.MeshBasicMaterial({
      color: 0x87ceeb,
      side: THREE.BackSide,
      gradientMap: createSkyGradient()
    });
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(sky);
    skyRef.current = sky;
    
    // Parent object for image
    const parentObject = new THREE.Object3D();
    scene.add(parentObject);
    parentObjectRef.current = parentObject;
    
    // Plane with improved material
    const geometry = new THREE.PlaneGeometry(5, 5, 128, 128); // More segments for better deformation
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0.0, 
    });
    const plane = new THREE.Mesh(geometry, material);
    plane.position.set(16, -10, 0);
    plane.scale.set(12, 10, 1);
    parentObject.add(plane);
    planeRef.current = plane;
    
    // Lighting for better color vibrancy
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();
  };

  // Create sky gradient texture
  const createSkyGradient = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#1e90ff');
    gradient.addColorStop(0.5, '#87ceeb');
    gradient.addColorStop(1, '#e0f7ff');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1, 256);
    
    return new THREE.CanvasTexture(canvas);
  };

  // Apply color correction to image data
  const applyColorCorrection = (imageData, saturation, sharpness) => {
    const data = imageData.data;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Put original image
    tempCtx.putImageData(imageData, 0, 0);
    
    // Apply saturation and vibrance
    tempCtx.filter = `saturate(${saturation}) contrast(1.1) brightness(1.05)`;
    tempCtx.drawImage(tempCanvas, 0, 0);
    
    // Get corrected data
    const correctedData = tempCtx.getImageData(0, 0, imageData.width, imageData.height);
    
    // Apply sharpening if needed
    if (sharpness > 1) {
      const sharpenedData = unsharpMask(correctedData, sharpness);
      return sharpenedData;
    }
    
    return correctedData;
  };

  // Unsharp masking for sharpening
  const unsharpMask = (imageData, amount) => {
    const width = imageData.width;
    const height = imageData.height;
    const srcData = imageData.data;
    const dstData = new Uint8ClampedArray(srcData.length);
    
    // Simple 3x3 convolution kernel for sharpening
    const kernel = [
      [-1, -1, -1],
      [-1,  9, -1],
      [-1, -1, -1]
    ];
    
    // Adjust kernel strength based on amount
    const strength = (amount - 1) * 0.5;
    kernel[1][1] += strength * 8;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) { // Only RGB, not Alpha
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
        dstData[(y * width + x) * 4 + 3] = 255; // Preserve alpha
      }
    }
    
    return new ImageData(dstData, width, height);
  };

  // Load and process GeoTIFF image with enhanced processing
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
      
      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      // Process the image data
      const imageData = ctx.createImageData(width, height);
      const data = imageData.data;
      
      if (raster.length === 1) {
        // Grayscale image with contrast enhancement
        const rasterData = raster[0];
        
        // Find min and max values for contrast stretching
        let min = Number.MAX_VALUE;
        let max = Number.MIN_VALUE;
        for (let i = 0; i < rasterData.length; i++) {
          const val = rasterData[i];
          if (val < min) min = val;
          if (val > max) max = val;
        }
        
        // Apply contrast stretching
        const range = max - min;
        for (let i = 0; i < rasterData.length; i++) {
          const val = rasterData[i];
          const stretched = ((val - min) / range) * 255;
          data[i * 4] = stretched;     // R
          data[i * 4 + 1] = stretched; // G
          data[i * 4 + 2] = stretched; // B
          data[i * 4 + 3] = 255;      // A
        }
      } else {
        // RGB image - apply directly with color correction later
        for (let i = 0; i < data.length; i += 4) {
          data[i] = raster[0][i / 4];     // R
          data[i + 1] = raster[1][i / 4]; // G
          data[i + 2] = raster[2][i / 4]; // B
          data[i + 3] = raster.length > 3 ? raster[3][i / 4] : 255; // A
        }
      }
      
      // Apply color correction and sharpening
      const correctedData = applyColorCorrection(
        imageData,
        params.saturation,
        params.sharpness
      );
      ctx.putImageData(correctedData, 0, 0);
      
      // Create Three.js texture with enhanced settings
      const texture = new THREE.CanvasTexture(canvas);
      texture.anisotropy = rendererRef.current.capabilities.getMaxAnisotropy();
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      
      if (planeRef.current) {
        // Update plane geometry to match image aspect ratio
        const aspectRatio = width / height;
        planeRef.current.geometry.dispose();
        planeRef.current.geometry = new THREE.PlaneGeometry(aspectRatio * 5, 5, 128, 128);
        
        // Apply enhanced texture
        planeRef.current.material.map = texture;
        planeRef.current.material.needsUpdate = true;
        setImageLoaded(true);
      }
      
    } catch (err) {
      console.error("Image loading error:", err);
      setError(`Failed to load image: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Update scene based on parameters
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
    
    // Validate inputs
    if (latitude < 12.5 || latitude > 13.5 || longitude < 77.0 || longitude > 78.0) {
      setError("Coordinates must be within Bengaluru area");
      return;
    }
    setError(null);
    
    // Calculate relative movement from center
    const latDiff = (latitude - centerLat) * 1000;
    const lonDiff = (longitude - centerLon) * 1000;
    
    // Apply transformations to parent object
    const parent = parentObjectRef.current;
    parent.position.set(lonDiff, -latDiff, 0);
    parent.rotation.set(
      THREE.MathUtils.degToRad(tilt),
      THREE.MathUtils.degToRad(pan),
      0
    );
    
    // Adjust scale based on altitude with non-linear scaling for better low-altitude detail
    const scale = Math.pow(1000 / Math.max(altitude, 10), 0.8);
    parent.scale.set(scale, scale, scale);
    
    // Update camera FOV
    const sensorHeight = pixelSizeY * height;
    const fov = 2 * Math.atan(sensorHeight / (2 * focalLength)) * (180 / Math.PI);
    cameraRef.current.fov = fov;
    cameraRef.current.updateProjectionMatrix();
    
    // Update sky visibility based on tilt
    skyRef.current.visible = tilt > 0;
    rendererRef.current.setClearColor(tilt > 0 || pan>0 ? 0x87ceeb : 0x000000, 1);
  };

  // High-quality export
  const exportImage = () => {
    if (!rendererRef.current || !imageLoaded) {
      setError("Scene not ready for export");
      return;
    }
    
    const renderer = rendererRef.current;
    const originalSize = renderer.getSize(new THREE.Vector2());
    const originalPixelRatio = renderer.getPixelRatio();
    
    // Set higher resolution for export
    renderer.setPixelRatio(2);
    renderer.setSize(params.width, params.height);
    
    // Render with enhanced settings
    renderer.render(sceneRef.current, cameraRef.current);
    
    // Create download link
    const link = document.createElement('a');
    link.download = 'aerial_view.png';
    link.href = renderer.domElement.toDataURL('image/png', 1.0);
    link.click();
    
    // Restore original settings
    renderer.setPixelRatio(originalPixelRatio);
    renderer.setSize(originalSize.x, originalSize.y);
  };

  // Initialize Three.js on mount
  useEffect(() => {
    initThreeJS();
    loadGeoTIFF();
    
    return () => {
      if (mountRef.current && rendererRef.current?.domElement) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, []);
  
  // Handle window resize
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

  // Update scene when parameters change
  useEffect(() => {
    updateScene();
  }, [params, imageLoaded]);

  return (
    <div className="app-container">
      <h1>Enhanced Aerial Image Viewer</h1>
      
      <div className="main-container">
        {/* Left section - Parameters */}
        <div className="left-section">
          {/* Camera Intrinsic Parameters */}
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
          
          {/* Camera Extrinsic Parameters */}
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
        
        {/* Right section - Camera View */}
        <div className="right-section">
          <fieldset className="camera-view">
            <legend>Camera View</legend>
            
            {loading && <div className="loading-message">Loading image...</div>}
            {error && <div className="error-message">{error}</div>}
            
            <div className="canvas-container" ref={mountRef}></div>
            
            <div className="button-container">
              <button onClick={updateScene} disabled={loading || !imageLoaded}>
                Generate View
              </button>
              <button onClick={exportImage} disabled={loading || !imageLoaded}>
                Export HD Image
              </button>
              <button onClick={loadGeoTIFF} disabled={loading}>
                Reload Image
              </button>
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  );
}

export default App;