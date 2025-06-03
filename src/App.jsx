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
  
  // Center coordinates
  const centerLat = 12.9611;
  const centerLon = 77.6532;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setParams(prev => ({
      ...prev,
      [name]: parseFloat(value),
    }));
  };

  // Initialize Three.js scene
  const initThreeJS = () => {
    const scene = sceneRef.current;
    const mount = mountRef.current;
    
    // Camera setup - position it to see the plane properly
    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 10000);
    camera.position.set(0, 0, 1000);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;
    
    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x87ceeb);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Create parent object for the image
    const parentObject = new THREE.Object3D();
    scene.add(parentObject);
    parentObjectRef.current = parentObject;
    
    // Create plane for the image
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1
    });
    const plane = new THREE.Mesh(geometry, material);
    parentObject.add(plane);
    planeRef.current = plane;
    
    // Add axes helper for debugging
    const axesHelper = new THREE.AxesHelper(100);
    scene.add(axesHelper);
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();
  };

  // Load and process GeoTIFF image
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
      
      let tiff;
      try {
        tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
      } catch (geoTiffError) {
        console.warn("Failed to parse as GeoTIFF, trying as regular TIFF", geoTiffError);
        tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer, { forceXHR: true, ignoreGeoTIFF: true });
      }

      const image = await tiff.getImage();
      const raster = await image.readRasters();
      const width = image.getWidth();
      const height = image.getHeight();
      
      // Create canvas and context
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      // Process the image data
      const imageData = ctx.createImageData(width, height);
      const data = imageData.data;
      
      if (raster.length === 1) {
        // Grayscale image
        const rasterData = raster[0];
        for (let i = 0; i < rasterData.length; i++) {
          const val = rasterData[i];
          data[i * 4] = val;     // R
          data[i * 4 + 1] = val; // G
          data[i * 4 + 2] = val; // B
          data[i * 4 + 3] = 255; // A
        }
      } else {
        // RGB or RGBA image
        for (let i = 0; i < data.length; i += 4) {
          data[i] = raster[0][i / 4];     // R
          data[i + 1] = raster[1][i / 4]; // G
          data[i + 2] = raster[2][i / 4]; // B
          data[i + 3] = raster.length > 3 ? raster[3][i / 4] : 255; // A
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      // Create Three.js texture from canvas
      const texture = new THREE.CanvasTexture(canvas);
      if (planeRef.current) {
        // Update plane geometry to match image aspect ratio
        const aspectRatio = width / height;
        planeRef.current.geometry.dispose();
        planeRef.current.geometry = new THREE.PlaneGeometry(aspectRatio, 1);
        
        // Apply texture
        planeRef.current.material.map = texture;
        planeRef.current.material.needsUpdate = true;
        setImageLoaded(true);
        
        // Scale the plane to a reasonable size (reduced from 100 to 30)
        const scale = 30;
        planeRef.current.scale.set(scale, scale, scale);
      }
      
      // Try to get geographic metadata if available
      try {
        const geoKeys = image.getGeoKeys();
        const tiepoint = image.getTiePoints();
        const pixelScale = image.getPixelScale();
        console.log('GeoTIFF Metadata:', { geoKeys, tiepoint, pixelScale });
      } catch (metaError) {
        console.log('No geographic metadata found in image');
      }
      
    } catch (err) {
      console.error("Image loading error:", err);
      setError(`Failed to load image: ${err.message}. Please ensure the file is a valid TIFF/GeoTIFF.`);
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
      setError("Latitude must be between 12.5-13.5 and Longitude between 77.0-78.0");
      return;
    }
    setError(null);
    
    // Calculate relative movement from center (reduced multiplier from 1000 to 50)
    const latDiff = (latitude - centerLat) * 50;
    const lonDiff = (longitude - centerLon) * 50;
    
    // Apply transformations to parent object
    const parent = parentObjectRef.current;
    parent.position.set(lonDiff, -latDiff, 0);
    parent.rotation.set(
      THREE.MathUtils.degToRad(tilt),
      THREE.MathUtils.degToRad(pan),
      0
    );
    
    // Adjust scale based on altitude (reduced scaling effect)
    const scale = (1000 / altitude) * 0.3; // Reduced multiplier from 0.5 to 0.3
    parent.scale.set(scale, scale, scale);
    
    // Update camera FOV based on focal length and pixel size
    const sensorHeight = pixelSizeY * height;
    const fov = 2 * Math.atan(sensorHeight / (2 * focalLength)) * (180 / Math.PI);
    cameraRef.current.fov = fov;
    cameraRef.current.updateProjectionMatrix();
    
    // Adjust camera position based on altitude (less aggressive zoom)
    const cameraDistance = 500 + (altitude * 0.1); // Reduced multiplier from 0.2 to 0.1
    cameraRef.current.position.z = cameraDistance;
    cameraRef.current.lookAt(0, 0, 0);
  };

  // Export image function
  const exportImage = () => {
    if (!rendererRef.current || !cameraRef.current) {
      setError("Three.js scene not initialized");
      return;
    }
    
    if (!imageLoaded) {
      setError("Please wait for the image to load first");
      return;
    }
    
    const { width, height } = params;
    const renderer = rendererRef.current;
    
    // Temporarily change renderer size
    const originalSize = renderer.getSize(new THREE.Vector2());
    renderer.setSize(width, height);
    
    // Render the scene
    renderer.render(sceneRef.current, cameraRef.current);
    
    // Create download link
    const link = document.createElement('a');
    link.download = 'synthetic_image.png';
    link.href = renderer.domElement.toDataURL('image/png');
    link.click();
    
    // Restore original size
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
  
  // Add resize handler for responsive Three.js canvas
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
      <h1>SimCamera Graphical User Interface</h1>
      
      <div className="main-container">
        {/* Left section - Parameters */}
        <div className="left-section">
          {/* Camera Intrinsic Parameters */}
          <fieldset className="parameter-group">
            <legend>Camera Intrinsic Parameters</legend>
            
            <div className="input-group">
              <label htmlFor="focalLength">Focal Length, λ (m):</label>
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
                <label htmlFor="pixelSizeX">Pixel Size sx (m):</label>
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
                <label htmlFor="pixelSizeY">Pixel Size sy (m):</label>
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
              <label htmlFor="pan">Pan (deg): [0 to 359]</label>
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
              <label htmlFor="tilt">Tilt (deg): [-45 to 45]</label>
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
                min="1"
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
                Generate
              </button>
              <button onClick={exportImage} disabled={loading || !imageLoaded}>
                Export
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