import React, { useRef, useState, useEffect } from 'react';
import { useBox } from '@react-three/cannon';
import { ThreeEvent, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface StickyNoteProps {
  position: [number, number, number];
  color: string;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  onCornerClick?: (corner: 'top-right' | 'bottom-right', position: [number, number, number]) => void;
  isGlobalDragging?: boolean;
  isDroppedNote?: boolean;
  rotation?: [number, number, number];
  thickness?: number;
  isCursorNoteActive?: boolean;
}

const StickyNote: React.FC<StickyNoteProps> = ({ 
  position, 
  color,
  onDragStart,
  onDragEnd,
  onHoverStart,
  onHoverEnd,
  onCornerClick,
  isGlobalDragging = false,
  isDroppedNote = false,
  rotation = [0, 0, 0],
  thickness,
  isCursorNoteActive = false
}) => {
  // Use provided thickness or default based on whether it's a dropped note
  const noteThickness = thickness ?? (isDroppedNote ? 0.002 : 0.1);
  
  const [ref, api] = useBox<THREE.Mesh>(() => ({
    mass: isDroppedNote ? 0.1 : 1, // Lighter mass for dropped notes
    position,
    rotation,
    args: [1, 1, noteThickness],
    material: { 
      friction: isDroppedNote ? 0.5 : 0.3, // More friction for dropped notes
      restitution: isDroppedNote ? 0.1 : 0.2 // Less bounce for dropped notes
    },
    linearDamping: isDroppedNote ? 0.99 : 0.95, // More damping for dropped notes
    angularDamping: isDroppedNote ? 0.99 : 0.95,
  }));

  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isRightCornerHovered, setIsRightCornerHovered] = useState(false);
  const [isLeftCornerHovered, setIsLeftCornerHovered] = useState(false);
  const dragOffset = useRef<THREE.Vector3>(new THREE.Vector3());
  const currentPosition = useRef<THREE.Vector3>(new THREE.Vector3(...position));
  const { camera, gl } = useThree();
  const plane = useRef<THREE.Plane>(new THREE.Plane());
  const intersectionPoint = useRef<THREE.Vector3>(new THREE.Vector3());
  const raycaster = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouse = useRef<THREE.Vector2>(new THREE.Vector2());

  // Floor level constant (matching the ground position in Scene.tsx)
  const FLOOR_LEVEL = -2;
  // Half height of the sticky note
  const HALF_HEIGHT = 0.5;

  // Add window-level event listeners for more reliable dragging
  useEffect(() => {
    if (isDragging) {
      const handleWindowMove = (e: PointerEvent) => {
        const normalized = {
          offsetX: e.clientX,
          offsetY: e.clientY,
          nativeEvent: {
            offsetX: e.clientX,
            offsetY: e.clientY
          }
        };
        handlePointerMove(normalized as unknown as ThreeEvent<PointerEvent>);
      };

      const handleWindowUp = (e: PointerEvent) => {
        const normalized = {
          offsetX: e.clientX,
          offsetY: e.clientY,
          nativeEvent: {
            offsetX: e.clientX,
            offsetY: e.clientY
          }
        };
        handlePointerUp(normalized as unknown as ThreeEvent<PointerEvent>);
      };

      window.addEventListener('pointermove', handleWindowMove);
      window.addEventListener('pointerup', handleWindowUp);

      return () => {
        window.removeEventListener('pointermove', handleWindowMove);
        window.removeEventListener('pointerup', handleWindowUp);
      };
    }
  }, [isDragging]);

  // Subscribe to position updates from physics
  useEffect(() => {
    const unsubscribe = api.position.subscribe((p) => {
      currentPosition.current.set(p[0], p[1], p[2]);
    });
    return unsubscribe;
  }, [api.position]);

  const getNormalizedPointerPosition = (e: { offsetX: number; offsetY: number }) => {
    const rect = gl.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.offsetX - rect.left) / rect.width) * 2 - 1,
      -((e.offsetY - rect.top) / rect.height) * 2 + 1
    );
  };

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (isDragging || isGlobalDragging || isRightCornerHovered || isLeftCornerHovered) return;
    
    document.body.style.cursor = 'grabbing';
    
    // Get the current world position of the sticky note
    const worldPosition = new THREE.Vector3();
    (ref.current as THREE.Mesh).getWorldPosition(worldPosition);
    currentPosition.current.copy(worldPosition);

    setIsDragging(true);
    onDragStart?.();

    // Disable physics while dragging
    api.mass.set(0);
    api.velocity.set(0, 0, 0);
    api.angularVelocity.set(0, 0, 0);

    // Update the drag plane to be parallel to the camera
    const normal = new THREE.Vector3(0, 0, 1);
    normal.applyQuaternion(camera.quaternion);
    plane.current.setFromNormalAndCoplanarPoint(
      normal,
      worldPosition
    );

    // Calculate intersection point and offset
    mouse.current.copy(getNormalizedPointerPosition(e.nativeEvent));
    raycaster.current.setFromCamera(mouse.current, camera);
    if (raycaster.current.ray.intersectPlane(plane.current, intersectionPoint.current)) {
      dragOffset.current.copy(worldPosition).sub(intersectionPoint.current);
    }
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!isDragging) return;
    e.stopPropagation?.();

    // Update intersection point with the drag plane
    mouse.current.copy(getNormalizedPointerPosition(e));
    raycaster.current.setFromCamera(mouse.current, camera);
    
    if (raycaster.current.ray.intersectPlane(plane.current, intersectionPoint.current)) {
      // Add the original offset to maintain relative position
      const newPosition = intersectionPoint.current.add(dragOffset.current);
      
      // Prevent going below floor level (accounting for sticky note height)
      newPosition.y = Math.max(FLOOR_LEVEL + HALF_HEIGHT, newPosition.y);
      
      // Update the physics body position
      api.position.set(newPosition.x, newPosition.y, newPosition.z);
      currentPosition.current.copy(newPosition);
    }
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!isDragging) return;
    e.stopPropagation?.();
    
    document.body.style.cursor = 'grab';
    setIsDragging(false);
    onDragEnd?.();

    // Re-enable physics
    api.mass.set(1);
  };

  const handlePointerEnter = () => {
    if (!isDragging && !isGlobalDragging) {
      setIsHovered(true);
      onHoverStart?.();
    }
  };

  const handlePointerLeave = () => {
    setIsHovered(false);
    onHoverEnd?.();
  };

  const handleRightCornerPointerEnter = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setIsRightCornerHovered(true);
  };

  const handleRightCornerPointerLeave = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setIsRightCornerHovered(false);
  };

  const handleLeftCornerPointerEnter = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setIsLeftCornerHovered(true);
  };

  const handleLeftCornerPointerLeave = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setIsLeftCornerHovered(false);
  };

  const handleCornerClick = (e: ThreeEvent<MouseEvent>, corner: 'top-right' | 'bottom-right') => {
    e.stopPropagation();
    const worldPosition = new THREE.Vector3();
    (ref.current as THREE.Mesh).getWorldPosition(worldPosition);
    onCornerClick?.(corner, [worldPosition.x, worldPosition.y, worldPosition.z]);
  };

  return (
    <mesh
      ref={ref}
      castShadow
      receiveShadow
      onPointerDown={!isDroppedNote ? handlePointerDown : undefined}
      onPointerUp={!isDroppedNote ? handlePointerUp : undefined}
      onPointerEnter={!isDroppedNote ? handlePointerEnter : undefined}
      onPointerLeave={!isDroppedNote ? handlePointerLeave : undefined}
    >
      <boxGeometry args={[1, 1, noteThickness]} />
      <meshStandardMaterial
        color={color}
        roughness={isDroppedNote ? 0.6 : 0.4}
        metalness={0.0}
        emissive={!isDroppedNote && (isHovered || isDragging) ? color : '#000000'}
        emissiveIntensity={!isDroppedNote && (isHovered || isDragging) ? 0.2 : 0}
        side={THREE.DoubleSide}
      />

      {/* Only show corner hover areas and full note hover detection for non-dropped notes and when no cursor note is active */}
      {!isDroppedNote && !isCursorNoteActive && (
        <>
          {/* Left (top-right) corner hover detection area */}
          <mesh 
            position={[0.35, 0.35, 0]}
            onPointerEnter={(e) => {
              e.stopPropagation();
              handleLeftCornerPointerEnter(e);
              document.body.style.cursor = 'pointer';
            }}
            onPointerLeave={(e) => {
              e.stopPropagation();
              handleLeftCornerPointerLeave(e);
              if (!isRightCornerHovered) {
                document.body.style.cursor = isHovered ? 'grab' : 'auto';
              }
            }}
            onPointerMove={(e) => {
              e.stopPropagation();
              document.body.style.cursor = 'pointer';
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleCornerClick(e, 'top-right');
            }}
          >
            <boxGeometry args={[0.4, 0.4, 0.15]} />
            <meshBasicMaterial visible={false} transparent opacity={0} />
          </mesh>

          {/* Right (bottom-right) corner hover detection area */}
          <mesh 
            position={[0.35, -0.35, 0]}
            onPointerEnter={(e) => {
              e.stopPropagation();
              handleRightCornerPointerEnter(e);
              document.body.style.cursor = 'pointer';
            }}
            onPointerLeave={(e) => {
              e.stopPropagation();
              handleRightCornerPointerLeave(e);
              if (!isLeftCornerHovered) {
                document.body.style.cursor = isHovered ? 'grab' : 'auto';
              }
            }}
            onPointerMove={(e) => {
              e.stopPropagation();
              document.body.style.cursor = 'pointer';
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleCornerClick(e, 'bottom-right');
            }}
          >
            <boxGeometry args={[0.4, 0.4, 0.15]} />
            <meshBasicMaterial visible={false} transparent opacity={0} />
          </mesh>

          {/* Full note hover detection area */}
          <mesh
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
            onPointerMove={(e) => {
              e.stopPropagation();
              if (!isRightCornerHovered && !isLeftCornerHovered && !isDragging) {
                document.body.style.cursor = 'grab';
              }
            }}
          >
            <boxGeometry args={[1, 1, noteThickness]} />
            <meshBasicMaterial visible={false} transparent opacity={0} />
          </mesh>

          {/* Right folded corner triangle */}
          {isRightCornerHovered && (
            <mesh position={[0.35, -0.35, -0.051]}>
              <extrudeGeometry
                args={[
                  new THREE.Shape([
                    new THREE.Vector2(0, 0),
                    new THREE.Vector2(0.15, 0),
                    new THREE.Vector2(0, -0.15),
                  ]),
                  {
                    depth: -0.015,
                    bevelEnabled: false
                  }
                ]}
              />
              <meshBasicMaterial
                color={color}
                side={THREE.DoubleSide}
              />
            </mesh>
          )}

          {/* Top-right folded corner triangle */}
          {isLeftCornerHovered && (
            <mesh position={[0.35, 0.35, -0.051]}>
              <extrudeGeometry
                args={[
                  new THREE.Shape([
                    new THREE.Vector2(0, 0),
                    new THREE.Vector2(0.15, 0),
                    new THREE.Vector2(0, 0.15),
                  ]),
                  {
                    depth: -0.015,
                    bevelEnabled: false
                  }
                ]}
              />
              <meshBasicMaterial
                color={color}
                side={THREE.DoubleSide}
              />
            </mesh>
          )}
        </>
      )}
    </mesh>
  );
};

export default StickyNote; 