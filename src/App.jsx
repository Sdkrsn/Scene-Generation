import React, { useState, useRef, useEffect } from "react";
import * as THREE from 'three';
import { fromArrayBuffer } from "geotiff";
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
  
  // Three.js objects
  const sceneRef = useRef(new THREE.Scene());
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const planeRef = useRef(null);
  const parentObjectRef = useRef(null);
  
  // Center coordinates (same as Module-2)
  const centerLat = 12.9611;
  const centerLon = 77.6532;
  
  // Initial position, rotation, and scale (same as Module-2)
  const initialPosition = { x: 16, y: -10, z: 0 };
  const initialRotation = { x: 0, y: 0, z: 0 };
  const initialScale = { x: 12, y: 10, z: 1 };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setParams(prev => ({
      ...prev,
      [name]: parseFloat(value),
    }));
  };

  // Initialize Three.js scene (similar to Module-2)
  const initThreeJS = () => {
    const scene = sceneRef.current;
    const mount = mountRef.current;
    
    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 1000);
    camera.position.z = 5;
    cameraRef.current = camera;
    
    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x87ceeb); // Blue background like Module-2
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Create parent object for the image (like Module-2)
    const parentObject = new THREE.Object3D();
    scene.add(parentObject);
    parentObjectRef.current = parentObject;
    
    // Create plane for the image
    const geometry = new THREE.PlaneGeometry(5, 5);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    const plane = new THREE.Mesh(geometry, material);
    
    // Set initial position, rotation, and scale
    plane.position.set(initialPosition.x, initialPosition.y, initialPosition.z);
    plane.rotation.set(initialRotation.x, initialRotation.y, initialRotation.z);
    plane.scale.set(initialScale.x, initialScale.y, initialScale.z);
    
    parentObject.add(plane);
    planeRef.current = plane;
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();
  };

  // Load and process GeoTIFF image
  const loadGeoTIFF = async () => {
    try {
      const response = await fetch("aa.tiff");
      if (!response.ok) throw new Error(`Failed to fetch image, status ${response.status}`);
      
      const arrayBuffer = await response.arrayBuffer();
      const tiff = await fromArrayBuffer(arrayBuffer);
      const image = await tiff.getImage();
      const rasters = await image.readRasters();
      const width = image.getWidth();
      const height = image.getHeight();
      
      // Create canvas from the image data
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const imgData = ctx.createImageData(width, height);
      
      // Process image data (simplified version of your original)
      const bandCount = rasters.length;
      if (bandCount >= 3) {
        // RGB image
        for (let i = 0; i < width * height; i++) {
          imgData.data[i * 4 + 0] = rasters[0][i]; // R
          imgData.data[i * 4 + 1] = rasters[1][i]; // G
          imgData.data[i * 4 + 2] = rasters[2][i]; // B
          imgData.data[i * 4 + 3] = 255; // Alpha
        }
      } else {
        // Grayscale image
        for (let i = 0; i < width * height; i++) {
          const val = rasters[0][i];
          imgData.data[i * 4 + 0] = val; // R
          imgData.data[i * 4 + 1] = val; // G
          imgData.data[i * 4 + 2] = val; // B
          imgData.data[i * 4 + 3] = 255; // Alpha
        }
      }
      
      ctx.putImageData(imgData, 0, 0);
      
      // Create Three.js texture from canvas
      const texture = new THREE.CanvasTexture(canvas);
      if (planeRef.current) {
        planeRef.current.material.map = texture;
        planeRef.current.material.needsUpdate = true;
      }
      
    } catch (err) {
      setError("Failed to load image: " + err.message);
      console.error(err);
    }
  };

  // Update scene based on parameters (similar to Module-2's generateOutput)
  const updateScene = () => {
    if (!parentObjectRef.current || !cameraRef.current) return;
    
    const { latitude, longitude, altitude, pan, tilt, focalLength, pixelSizeY, height } = params;
    
    // Validate inputs (like Module-2)
    if (latitude < 12.5 || latitude > 13.5 || longitude < 77.0 || longitude > 78.0) {
      setError("Latitude must be between 12.5-13.5 and Longitude between 77.0-78.0");
      return;
    }
    setError(null);
    
    // Calculate relative movement from center (like Module-2)
    const latDiff = (latitude - centerLat) * 1000;
    const lonDiff = (longitude - centerLon) * 1000;
    
    // Apply transformations to parent object (like Module-2)
    const parent = parentObjectRef.current;
    parent.position.x = lonDiff;
    parent.position.y = -latDiff;
    parent.rotation.y = THREE.MathUtils.degToRad(pan);
    parent.rotation.x = THREE.MathUtils.degToRad(tilt);
    
    // Adjust scale based on altitude (like Module-2)
    const scale = 1000 / altitude;
    parent.scale.set(scale, scale, scale);
    
    // Update camera FOV based on focal length and pixel size (like Module-2)
    const sensorHeight = pixelSizeY * height;
    const fov = 2 * Math.atan(sensorHeight / (2 * focalLength)) * (180 / Math.PI);
    cameraRef.current.fov = fov;
    cameraRef.current.updateProjectionMatrix();
  };

  // Export image function (similar to Module-2)
  const exportImage = () => {
    if (!rendererRef.current || !cameraRef.current) return;
    
    const { width, height } = params;
    const renderer = rendererRef.current;
    
    // Create temporary renderer
    const tempRenderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    tempRenderer.setSize(width, height);
    tempRenderer.setClearColor(0x87ceeb);
    tempRenderer.render(sceneRef.current, cameraRef.current);
    
    // Create download link
    const link = document.createElement('a');
    link.download = 'synthetic_image.png';
    link.href = tempRenderer.domElement.toDataURL('image/png');
    link.click();
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
  
  // Update scene when parameters change
  useEffect(() => {
    updateScene();
  }, [params]);

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
            
            {error && <div className="error-message">{error}</div>}
            
            <div className="canvas-container" ref={mountRef}></div>
            
            <div className="button-container">
              <button onClick={updateScene}>Generate</button>
              <button onClick={exportImage}>Export</button>
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  );
}

export default App;