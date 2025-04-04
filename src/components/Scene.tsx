import React, { useState, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Physics, usePlane } from '@react-three/cannon';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import StickyNote from './StickyNote';
import CameraController from './CameraController';

const COLORS = ['#ffd700', '#ffa500', '#ff69b4', '#98fb98', '#87ceeb'];
const PAD_THICKNESS = 0.1; // Thickness of the pad
const NOTE_THICKNESS = 0.002; // Thickness of single notes

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

interface CursorNoteProps {
  cursorNote: {
    id: number;
    position: [number, number, number];
    color: string;
    sourcePosition: [number, number, number];
  } | null;
  mousePos: [number, number, number];
  onMouseMove: (pos: [number, number, number]) => void;
}

const CursorNote: React.FC<CursorNoteProps> = ({ cursorNote, mousePos, onMouseMove }) => {
  const { camera } = useThree();
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const planeRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, 1, 0))); // Horizontal plane

  useEffect(() => {
    if (!cursorNote) return;

    // Ensure cursor stays as all-scroll while moving
    document.body.style.cursor = 'all-scroll';

    const handleMouseMove = (event: MouseEvent) => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;

      // Keep enforcing the cursor style during movement
      document.body.style.cursor = 'all-scroll';

      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Set up raycaster from camera
      raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), camera);

      // Get the height of the source note
      const sourceHeight = cursorNote.sourcePosition[1];

      // Create a plane at the same height as the source note
      planeRef.current.constant = -sourceHeight;

      const intersectionPoint = new THREE.Vector3();
      if (raycasterRef.current.ray.intersectPlane(planeRef.current, intersectionPoint)) {
        onMouseMove([intersectionPoint.x, sourceHeight, intersectionPoint.z]);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      // Reset cursor only if we're not still in cursor note mode
      if (!cursorNote) {
        document.body.style.cursor = 'auto';
      }
    };
  }, [cursorNote, camera, onMouseMove]);

  if (!cursorNote) return null;

  return (
    <mesh 
      position={mousePos}
      rotation={[-Math.PI / 2, 0, 0]} // Keep it horizontal
      onPointerMove={(e) => {
        e.stopPropagation();
        // Ensure cursor stays consistent during movement
        document.body.style.cursor = 'all-scroll';
      }}
    >
      <boxGeometry args={[1, 1, NOTE_THICKNESS]} />
      <meshStandardMaterial
        color={cursorNote.color}
        transparent
        opacity={0.7}
        side={THREE.DoubleSide}
        roughness={0.6}
        metalness={0.0}
      />
    </mesh>
  );
};

const Scene: React.FC = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [notes, setNotes] = useState(() => 
    Array.from({ length: 5 }, (_, i) => ({
      id: i,
      position: [0, 2 + i * 0.5, 0] as [number, number, number],
      color: COLORS[i % COLORS.length],
      isDropped: false,
      rotation: [0, 0, 0] as [number, number, number],
      thickness: 0.1 // Thicker for pad notes
    }))
  );
  const [cursorNote, setCursorNote] = useState<{
    id: number;
    position: [number, number, number];
    color: string;
    sourcePosition: [number, number, number];
  } | null>(null);
  const [mousePos, setMousePos] = useState<[number, number, number]>([0, 0, 0]);
  const justCreatedRef = useRef(false);

  const handleCornerClick = (corner: 'top-right' | 'bottom-right', position: [number, number, number], color: string) => {
    if (!cursorNote) {
      justCreatedRef.current = true;
      
      // Create a new note attached to cursor at the source position, but slightly higher
      const heightOffset = PAD_THICKNESS / 2 + NOTE_THICKNESS; // Half pad thickness plus note thickness
      const elevatedPosition: [number, number, number] = [
        position[0],
        position[1] + heightOffset,
        position[2]
      ];
      
      setCursorNote({
        id: Date.now(),
        position: elevatedPosition,
        color,
        sourcePosition: elevatedPosition // Update source position to match elevated position
      });
      setMousePos(elevatedPosition);

      // Reset the flag after a short delay
      setTimeout(() => {
        justCreatedRef.current = false;
      }, 100);
    }
  };

  // Handle clicking anywhere to drop the note
  const handleCanvasClick = (event: THREE.Event) => {
    // Prevent immediate drop when creating the note
    if (justCreatedRef.current) {
      return;
    }

    if (cursorNote) {
      // Create a new physical note slightly above the current position
      const dropPosition: [number, number, number] = [
        mousePos[0],
        mousePos[1], // No additional height for immediate drop
        mousePos[2]
      ];

      // Add the new note to the notes array with horizontal rotation
      setNotes(prevNotes => [...prevNotes, {
        id: cursorNote.id,
        position: dropPosition,
        color: cursorNote.color,
        isDropped: true,
        rotation: [-Math.PI / 2, 0, 0],
        thickness: NOTE_THICKNESS // Add thickness to match cursor note
      }]);

      // Remove the cursor note
      setCursorNote(null);
    }
  };

  // Global cursor management
  useEffect(() => {
    if (cursorNote) {
      document.body.style.cursor = 'all-scroll'; // Changed from 'move' to 'all-scroll' for pinch effect
    } else if (isDragging) {
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    } else if (isHovering) {
      document.body.style.cursor = 'grab';
      document.body.style.userSelect = 'auto';
    } else {
      document.body.style.cursor = 'auto';
      document.body.style.userSelect = 'auto';
    }

    return () => {
      document.body.style.cursor = 'auto';
      document.body.style.userSelect = 'auto';
    };
  }, [isDragging, isHovering, cursorNote]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas 
        shadows 
        camera={{ 
          position: [3.55, 2.37, 2.59],
          fov: 50 
        }}
        style={{ 
          background: '#f5f5f5',
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0
        }}
        onClick={handleCanvasClick}
      >
        <CameraController />
        <OrbitControls 
          makeDefault 
          enabled={!isDragging && !cursorNote && !isHovering}
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 2.1}
        />
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
              rotation={note.rotation}
              thickness={note.thickness}
              onDragStart={() => setIsDragging(true)}
              onDragEnd={() => setIsDragging(false)}
              onHoverStart={() => setIsHovering(true)}
              onHoverEnd={() => setIsHovering(false)}
              onCornerClick={(corner, pos) => handleCornerClick(corner, pos, note.color)}
              isGlobalDragging={isDragging}
              isDroppedNote={note.isDropped}
              isCursorNoteActive={cursorNote !== null}
            />
          ))}
          <CursorNote 
            cursorNote={cursorNote}
            mousePos={mousePos}
            onMouseMove={setMousePos}
          />
        </Physics>
        <Environment preset="city" />
      </Canvas>
    </div>
  );
};

export default Scene; 