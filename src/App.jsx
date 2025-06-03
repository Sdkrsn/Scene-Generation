import React, { useState, useRef } from "react";
import "./App.css";
import { fromArrayBuffer } from "geotiff";

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
    principalX: 320.5,
    principalY: 240.5,
    width: 640,
    height: 480,
  });

  const canvasRef = useRef(null);
  const MAX_SIZE = 400; // Max canvas size (width and height)

  const handleChange = (e) => {
    const { name, value } = e.target;
    setParams((prev) => ({
      ...prev,
      [name]: parseFloat(value),
    }));
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const tiff = await fromArrayBuffer(arrayBuffer);
      const image = await tiff.getImage();
      const rasters = await image.readRasters();
      const width = image.getWidth();
      const height = image.getHeight();

      // Calculate scale to fit inside MAX_SIZE x MAX_SIZE box
      const scale = Math.min(MAX_SIZE / width, MAX_SIZE / height);

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      canvas.width = MAX_SIZE;
      canvas.height = MAX_SIZE;

      // Create image data for original resolution
      const imgData = ctx.createImageData(width, height);
      const bandCount = rasters.length;

      for (let i = 0; i < width * height; i++) {
        const r = bandCount >= 1 ? rasters[0][i] : 0;
        const g = bandCount >= 2 ? rasters[1][i] : r;
        const b = bandCount >= 3 ? rasters[2][i] : r;
        const a = bandCount === 4 ? rasters[3][i] : 255;
        imgData.data[i * 4 + 0] = r;
        imgData.data[i * 4 + 1] = g;
        imgData.data[i * 4 + 2] = b;
        imgData.data[i * 4 + 3] = a;
      }

      // Draw original image data on offscreen canvas
      const offscreen = document.createElement("canvas");
      offscreen.width = width;
      offscreen.height = height;
      const offCtx = offscreen.getContext("2d");
      offCtx.putImageData(imgData, 0, 0);

      // Clear main canvas and draw scaled image from offscreen
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        offscreen,
        0,
        0,
        width,
        height,
        0,
        0,
        width * scale,
        height * scale
      );
    } catch (error) {
      alert("Failed to read GeoTIFF file. Reason: " + error.message);
      console.error(error);
    }
  };

  return (
    <div className="container">
      <h1>Synthetic Aerial Image Generator</h1>

      <div className="panel-container">
        {/* Intrinsic Parameters */}
        <div className="panel">
          <h2>Intrinsic (Camera Parameters)</h2>
          <div className="grid">
            {[
              "focalLength",
              "pixelSizeX",
              "pixelSizeY",
              "principalX",
              "principalY",
              "width",
              "height",
            ].map((key) => (
              <div key={key} className="form-group">
                <label>{key}</label>
                <input
                  type="number"
                  step="any"
                  name={key}
                  value={params[key]}
                  onChange={handleChange}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Extrinsic Parameters */}
        <div className="panel">
          <h2>Extrinsic (Position & Orientation)</h2>
          <div className="grid">
            {["latitude", "longitude", "altitude", "pan", "tilt"].map((key) => (
              <div key={key} className="form-group">
                <label>{key}</label>
                <input
                  type="number"
                  step="any"
                  name={key}
                  value={params[key]}
                  onChange={handleChange}
                />
              </div>
            ))}
          </div>

          <div className="form-group">
            <label>Upload GeoTIFF</label>
            <input type="file" accept=".tif,.tiff" onChange={handleFileChange} />
          </div>
        </div>
      </div>

      <div className="canvas-panel">
        <h2>Generated Scene</h2>
        <canvas
          ref={canvasRef}
          style={{ border: "1px solid #ccc", backgroundColor: "#eee" }}
        ></canvas>
      </div>
    </div>
  );
}

export default App;
