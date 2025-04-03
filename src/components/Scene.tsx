import React, { useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics, usePlane } from '@react-three/cannon';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import StickyNote from './StickyNote';

const COLORS = ['#ffd700', '#ffa500', '#ff69b4', '#98fb98', '#87ceeb'];

function Ground() {
  const [ref] = usePlane<THREE.Mesh>(() => ({
    rotation: [-Math.PI / 2, 0, 0],
    position: [0, -2, 0],
    material: { friction: 0.3 }
  }));

  return (
    <mesh ref={ref} receiveShadow>
      <planeGeometry args={[50, 50]} />
      <meshStandardMaterial color="#f0f0f0" />
    </mesh>
  );
}

const Scene: React.FC = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  
  // Global cursor management
  useEffect(() => {
    const setCursor = (cursor: string) => {
      document.body.style.cursor = cursor;
    };

    if (isDragging) {
      setCursor('grabbing');
      document.body.style.userSelect = 'none';
    } else if (isHovering) {
      setCursor('grab');
      document.body.style.userSelect = 'auto';
    } else {
      setCursor('auto');
      document.body.style.userSelect = 'auto';
    }

    return () => {
      setCursor('auto');
      document.body.style.userSelect = 'auto';
    };
  }, [isDragging, isHovering]);

  const notes = Array.from({ length: 5 }, (_, i) => ({
    id: i,
    position: [0, 2 + i * 0.5, 0] as [number, number, number],
    color: COLORS[i % COLORS.length],
  }));

  return (
    <Canvas 
      shadows 
      camera={{ position: [5, 5, 5], fov: 50 }}
      style={{ 
        background: '#f5f5f5',
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0
      }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[10, 10, 10]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <Physics 
        gravity={[0, -9.81, 0]}
        defaultContactMaterial={{
          friction: 0.3,
          restitution: 0.2,
          contactEquationStiffness: 1e6,
          contactEquationRelaxation: 3,
        }}
        iterations={20}
      >
        <Ground />
        {notes.map((note) => (
          <StickyNote
            key={note.id}
            position={note.position}
            color={note.color}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={() => setIsDragging(false)}
            onHoverStart={() => setIsHovering(true)}
            onHoverEnd={() => setIsHovering(false)}
            isGlobalDragging={isDragging}
          />
        ))}
      </Physics>
      <OrbitControls 
        makeDefault 
        enabled={!isDragging}
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2.1}
      />
      <Environment preset="city" />
    </Canvas>
  );
};

export default Scene; 