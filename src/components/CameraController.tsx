import React, { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import GUI from 'lil-gui';
import * as THREE from 'three';

const lilGuiStyles = `
  .lil-gui {
    --background-color: #1f1f1f;
    --text-color: #ebebeb;
    --title-background-color: #111111;
    --title-text-color: #ebebeb;
    --widget-color: #424242;
    --hover-color: #4f4f4f;
    --focus-color: #595959;
    --number-color: #2cc9ff;
    --string-color: #a2db3c;
    --font-size: 11px;
    --input-font-size: 11px;
    --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    --font-family-mono: Menlo, Monaco, Consolas, "Droid Sans Mono", monospace;
    --padding: 4px;
    --spacing: 4px;
    --widget-height: 20px;
    --title-height: calc(var(--widget-height) + var(--spacing) * 1.25);
    --name-width: 45%;
    --slider-knob-width: 2px;
    --slider-input-width: 27%;
    --color-input-width: 27%;
    --slider-input-min-width: 45px;
    --color-input-min-width: 45px;
    --folder-indent: 7px;
    --widget-padding: 0 0 0 3px;
    --widget-border-radius: 2px;
    --checkbox-size: calc(0.75 * var(--widget-height));
    --scrollbar-width: 5px;
  }
`;

interface CameraControllerProps {
  isDebugMode?: boolean;
}

const CameraController: React.FC<CameraControllerProps> = ({ isDebugMode = true }) => {
  const { camera } = useThree();
  const guiRef = useRef<GUI | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  // Check if camera is PerspectiveCamera
  if (!(camera instanceof THREE.PerspectiveCamera)) {
    console.warn('Camera controller requires a PerspectiveCamera');
    return null;
  }

  useEffect(() => {
    if (!isDebugMode || !(camera instanceof THREE.PerspectiveCamera)) return;

    // Add styles
    if (!document.getElementById('lil-gui-styles')) {
      const style = document.createElement('style');
      style.id = 'lil-gui-styles';
      style.textContent = lilGuiStyles;
      document.head.appendChild(style);
      styleRef.current = style;
    }

    // Create GUI
    const gui = new GUI({ 
      title: 'Camera Settings',
      container: document.body,
      autoPlace: true,
    });
    
    // Ensure GUI is visible and interactive
    gui.domElement.style.position = 'fixed';
    gui.domElement.style.top = '10px';
    gui.domElement.style.right = '10px';
    gui.domElement.style.zIndex = '1000';
    gui.domElement.style.pointerEvents = 'auto';
    guiRef.current = gui;

    // Camera settings object
    const settings = {
      position: {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z
      },
      rotation: {
        x: THREE.MathUtils.radToDeg(camera.rotation.x),
        y: THREE.MathUtils.radToDeg(camera.rotation.y),
        z: THREE.MathUtils.radToDeg(camera.rotation.z)
      },
      fov: camera.fov,
      copySettings: () => {
        const pos = settings.position;
        const text = `position={[${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}]} fov={${settings.fov}}`;
        navigator.clipboard.writeText(text);
        console.log('Camera settings copied to clipboard:', text);
      }
    };

    // Position controls
    const posFolder = gui.addFolder('Position');
    posFolder.add(settings.position, 'x', -20, 20, 0.1)
      .onChange((value: number) => camera.position.x = value);
    posFolder.add(settings.position, 'y', -20, 20, 0.1)
      .onChange((value: number) => camera.position.y = value);
    posFolder.add(settings.position, 'z', -20, 20, 0.1)
      .onChange((value: number) => camera.position.z = value);
    posFolder.open();

    // Rotation controls
    const rotFolder = gui.addFolder('Rotation');
    rotFolder.add(settings.rotation, 'x', -180, 180, 1)
      .onChange((value: number) => camera.rotation.x = THREE.MathUtils.degToRad(value));
    rotFolder.add(settings.rotation, 'y', -180, 180, 1)
      .onChange((value: number) => camera.rotation.y = THREE.MathUtils.degToRad(value));
    rotFolder.add(settings.rotation, 'z', -180, 180, 1)
      .onChange((value: number) => camera.rotation.z = THREE.MathUtils.degToRad(value));

    // FOV control
    gui.add(settings, 'fov', 20, 120, 1)
      .onChange((value: number) => {
        camera.fov = value;
        camera.updateProjectionMatrix();
      });

    // Add copy button
    gui.add(settings, 'copySettings').name('Copy Settings');

    // Update GUI values when camera changes from OrbitControls
    const updateGUIValues = () => {
      settings.position.x = camera.position.x;
      settings.position.y = camera.position.y;
      settings.position.z = camera.position.z;
      settings.rotation.x = THREE.MathUtils.radToDeg(camera.rotation.x);
      settings.rotation.y = THREE.MathUtils.radToDeg(camera.rotation.y);
      settings.rotation.z = THREE.MathUtils.radToDeg(camera.rotation.z);
      settings.fov = camera.fov;
      gui.controllersRecursive().forEach(controller => controller.updateDisplay());
    };

    const animateFrame = () => {
      updateGUIValues();
      requestAnimationFrame(animateFrame);
    };
    animateFrame();

    return () => {
      gui.destroy();
      if (styleRef.current) {
        styleRef.current.remove();
      }
    };
  }, [camera, isDebugMode]);

  return null;
};

export default CameraController; 