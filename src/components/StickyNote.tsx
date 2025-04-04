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
  
  // Floor level constant (matching the ground position in Scene.tsx)
  const FLOOR_LEVEL = -2;
  // Half height of the sticky note (reduced to make it sit closer to floor)
  const HALF_HEIGHT = 0.01;
  // Increased floor offset to prevent z-fighting and ensure solid collision
  const FLOOR_OFFSET = 0.01;
  // Minimal bounce impulse for more stable stacking
  const FLOOR_BOUNCE_IMPULSE = 0.2;
  // Force floor check interval (ms)
  const FLOOR_CHECK_INTERVAL = 16; // ~60fps
  // Creation timestamp to track order of creation
  const creationTime = useRef(Date.now());
  // Z-offset for stacking order (newer notes have higher z-index)
  const zOffset = useRef(isDroppedNote ? (position[2] || 0) : 0);
  // Minimum vertical distance between stacked notes to prevent z-fighting
  const STACK_SEPARATION = 0.03;
  // Initial vertical boost for new notes
  const INITIAL_HEIGHT_BOOST = 0.2;
  // Maximum stacking height difference detection
  const MAX_STACK_DETECTION_DISTANCE = 0.1;

  // Track the highest y position this note has reached
  const highestYPosition = useRef(position[1]);
  // Track whether the note has settled
  const [hasSettled, setHasSettled] = useState(false);
  // Track settle time to prevent further adjustments after settling
  const settleTime = useRef(0);

  useEffect(() => {
    // For newly created dropped notes, ensure they have a unique z position
    // that puts them above previously created notes
    if (isDroppedNote) {
      zOffset.current = position[2] || 0;
      
      // Ensure each new note gets a fresh timestamp
      creationTime.current = Date.now();
      
      // Initialize highest position tracker
      highestYPosition.current = position[1];
      
      // Reset settle state for new notes
      setHasSettled(false);
      settleTime.current = 0;
    }
  }, [isDroppedNote, position]);

  const [ref, api] = useBox<THREE.Mesh>(() => {
    // For dropped notes, slightly adjust initial position to ensure proper stacking
    let initialPosition: [number, number, number] = [...position] as [number, number, number];
    if (isDroppedNote) {
      // Ensure position is valid with extra height for new notes
      initialPosition = [
        position[0] || 0,
        Math.max(position[1] || 0, FLOOR_LEVEL + HALF_HEIGHT + FLOOR_OFFSET + INITIAL_HEIGHT_BOOST),
        position[2] || 0
      ];
    }
    
    return {
      mass: isDroppedNote ? 0.1 : 1,
      position: initialPosition,
      rotation: [Math.PI / 2, 0, 0],
      args: [1, 1, noteThickness],
      material: { 
        friction: isDroppedNote ? 0.8 : 0.3, // Reduced friction for smoother stacking
        restitution: isDroppedNote ? 0.01 : 0.05, // Further reduced bounce
        contactEquationStiffness: 1e9, // Increased stiffness for more rigid collisions
        contactEquationRelaxation: 1, // Minimum relaxation for maximum rigidity
      },
      linearDamping: isDroppedNote ? 0.99 : 0.95,
      angularDamping: isDroppedNote ? 0.99 : 0.98, // Increased angular damping
      allowSleep: true,
      sleepSpeedLimit: 0.01, // Much lower sleep threshold for quicker stabilization
      sleepTimeLimit: 0.1,
      collisionResponse: true,
      fixedRotation: false,
      collisionFilterGroup: 1, // Default collision group
      collisionFilterMask: 255, // Collide with everything
    };
  });

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
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  // Track if this note has been repositioned
  const hasBeenRepositioned = useRef(false);

  // Track if note is visible
  const [isVisible, setIsVisible] = useState(true);
  const lastValidPosition = useRef(new THREE.Vector3(...position));
  const lastValidRotation = useRef<[number, number, number]>([0, 0, 0]);

  // Add window-level event listeners for more reliable dragging
  useEffect(() => {
    if (isDragging) {
      // Keep cursor consistent during dragging
      document.body.style.cursor = 'grabbing';

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
        // Reset cursor only if we're not hovering
        if (!isHovered) {
          document.body.style.cursor = 'auto';
        }
      };
    }
  }, [isDragging]);

  // Set up a timer to continuously enforce floor constraint and maintain separation
  useEffect(() => {
    if (!isDroppedNote) return;
    
    const floorY = FLOOR_LEVEL + HALF_HEIGHT + FLOOR_OFFSET;
    
    // Force check and enforce floor constraint periodically
    const intervalId = setInterval(() => {
      if (!ref.current) return;
      
      // Get the current world position
      const worldPos = new THREE.Vector3();
      (ref.current as THREE.Mesh).getWorldPosition(worldPos);
      
      // Update highest position if needed
      if (worldPos.y > highestYPosition.current) {
        highestYPosition.current = worldPos.y;
      }
      
      // If note is very close to floor or seems to have settled
      if (!isDragging) {
        // Get current velocity
        let currentVelocity: [number, number, number] = [0, 0, 0];
        api.velocity.subscribe((v) => {
          currentVelocity = v;
        })();
        
        // Check if note is nearly stationary
        const isNearlyStationary = 
          Math.abs(currentVelocity[0]) < 0.01 && 
          Math.abs(currentVelocity[1]) < 0.01 && 
          Math.abs(currentVelocity[2]) < 0.01;
        
        // If note has dropped from a significant height and is now near the floor
        if (worldPos.y < floorY + MAX_STACK_DETECTION_DISTANCE && 
            Math.abs(highestYPosition.current - worldPos.y) > 0.1 &&
            isNearlyStationary) {
          
          // If not yet settled, mark as settled
          if (!hasSettled) {
            setHasSettled(true);
            settleTime.current = performance.now();
            
            // Add minimal vertical offset to ensure strict rendering order
            // Add a tiny bit of randomness to Z position to prevent perfect alignment
            const offset = creationTime.current % 1000 / 1000 * 0.001; // 0-0.001 range
            
            // Floor + separation + timestamp-based offset ensures proper z-ordering
            const finalY = floorY + STACK_SEPARATION + offset;
            
            // Hard freeze in place
            api.position.set(worldPos.x, finalY, worldPos.z);
            api.velocity.set(0, 0, 0);
            api.angularVelocity.set(0, 0, 0);
            api.rotation.set(Math.PI/2, 0, 0);
            api.mass.set(0.5); // Increased mass for stability
            
            // Reduce mass after stability is achieved
            setTimeout(() => {
              if (!isDragging) {
                api.mass.set(0.2);
              }
            }, 500);
          }
        }
      }
      
      // Regular floor correction (only needed if not settled)
      if (worldPos.y < floorY && !hasSettled) {
        // If below floor level, correct immediately
        api.position.set(worldPos.x, floorY + STACK_SEPARATION, worldPos.z);
        api.velocity.set(0, 0, 0);
        api.wakeUp();
      }
      
    }, FLOOR_CHECK_INTERVAL);
    
    return () => clearInterval(intervalId);
  }, [api, isDroppedNote, isDragging, hasSettled]);

  // Subscribe to position and rotation updates
  useEffect(() => {
    let lastY = position[1];
    let velocityY = 0;
    let consecutiveFloorHits = 0;
    let lastFloorHitTime = 0;
    const floorY = FLOOR_LEVEL + HALF_HEIGHT + FLOOR_OFFSET;
    
    // If it's a dropped note, ensure it starts above other notes
    if (isDroppedNote) {
      // Apply a larger upward impulse when first created to ensure it stays on top
      // and a slight horizontal impulse to prevent perfect stacking
      setTimeout(() => {
        // Add tiny random horizontal movement to prevent perfect alignment
        const randomX = (Math.random() - 0.5) * 0.01;
        const randomZ = (Math.random() - 0.5) * 0.01;
        api.velocity.set(randomX, 0.5, randomZ);
        api.wakeUp();
      }, 0);
    }

    const unsubscribePos = api.position.subscribe((p) => {
      // Skip position adjustments if note has settled for more than 1 second
      // and is not being dragged
      if (hasSettled && 
          performance.now() - settleTime.current > 1000 && 
          !isDragging) {
        return;
      }
        
      // Validate position
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) {
        console.warn('Invalid position detected, resetting to last valid position');
        api.position.set(
          lastValidPosition.current.x,
          lastValidPosition.current.y,
          lastValidPosition.current.z
        );
        return;
      }

      // Update highest position tracker
      if (p[1] > highestYPosition.current) {
        highestYPosition.current = p[1];
      }

      const currentTime = performance.now();

      // Strict floor constraint - immediate correction (only if not settled)
      if (p[1] < floorY && !hasSettled) {
        // Hard-stop at floor level + minimum separation
        api.position.set(p[0], floorY + STACK_SEPARATION, p[2]);
        
        if (isDroppedNote && !isDragging) {
          // Calculate approximate velocity
          velocityY = (p[1] - lastY) / Math.max(1, currentTime - lastFloorHitTime);
          
          if (currentTime - lastFloorHitTime < 100) {
            consecutiveFloorHits++;
          } else {
            consecutiveFloorHits = Math.max(1, consecutiveFloorHits - 1);
          }
          
          lastFloorHitTime = currentTime;

          // Complete velocity reset on floor contact
          api.velocity.set(0, 0, 0);
          api.angularVelocity.set(0, 0, 0);

          // Apply minimal bounce only if falling with significant velocity
          if (Math.abs(velocityY) > 0.1) {
            const impulseStrength = Math.min(Math.abs(velocityY) * FLOOR_BOUNCE_IMPULSE, 0.05);
            api.applyImpulse([0, impulseStrength, 0], [0, 0, 0]);
          }

          // If consistently hitting floor, add more stabilization
          if (consecutiveFloorHits > 2) {
            // Increase mass briefly for better stability in stacks
            api.mass.set(0.8);
            api.position.set(p[0], floorY + STACK_SEPARATION, p[2]);
            api.rotation.set(Math.PI/2, 0, 0);
            
            // Reset after stabilization
            setTimeout(() => {
              if (!isDragging) {
                api.mass.set(0.2); // Higher base mass for stability
                
                // If note appears stable, mark it as settled
                if (!hasSettled) {
                  setHasSettled(true);
                  settleTime.current = performance.now();
                }
              }
            }, 200);
            
            consecutiveFloorHits = 0;
          }
        }
      } else {
        // Update tracking variables when above floor
        lastY = p[1];
        if (p[1] >= floorY && Math.abs(p[1] - lastValidPosition.current.y) < 2) {
          lastValidPosition.current.set(p[0], p[1], p[2]);
        }
      }

      currentPosition.current.set(p[0], p[1], p[2]);
    });

    const unsubscribeRot = api.rotation.subscribe((r) => {
      // Keep track of valid rotation
      if (r.every(v => Number.isFinite(v))) {
        lastValidRotation.current = [r[0], r[1], r[2]];
        
        // Stricter rotation constraint
        if (Math.abs(r[0] - Math.PI/2) > 0.15) { // Reduced tilt allowance
          api.rotation.set(Math.PI/2, r[1], r[2]);
          api.angularVelocity.set(0, 0, 0); // Stop rotation when hitting limit
        }
      }
    });

    return () => {
      unsubscribePos();
      unsubscribeRot();
    };
  }, [api.position, api.rotation, api.velocity, api.mass, isDroppedNote, position, isDragging, hasSettled]);

  // Handle smooth material transitions
  useEffect(() => {
    if (materialRef.current) {
      // Create a transition for roughness and emissive intensity
      const startRoughness = materialRef.current.roughness;
      const targetRoughness = isDroppedNote ? 0.6 : 0.4;
      const startEmissiveIntensity = materialRef.current.emissiveIntensity;
      const targetEmissiveIntensity = (isHovered || isDragging) ? 0.2 : 0;
      
      let startTime = performance.now();
      const duration = 300; // 300ms transition
      
      const updateMaterial = () => {
        const now = performance.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease in-out function
        const easeProgress = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        if (materialRef.current) {
          materialRef.current.roughness = startRoughness + (targetRoughness - startRoughness) * easeProgress;
          materialRef.current.emissiveIntensity = startEmissiveIntensity + 
            (targetEmissiveIntensity - startEmissiveIntensity) * easeProgress;
        }
        
        if (progress < 1) {
          requestAnimationFrame(updateMaterial);
        }
      };
      
      requestAnimationFrame(updateMaterial);
    }
  }, [isDroppedNote, isHovered, isDragging]);

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

    // Reset physics state when starting to drag
    resetPhysicsState();

    // Set up initial drag plane based on camera view
    setupDragPlane(worldPosition);

    // Calculate intersection point and offset
    mouse.current.copy(getNormalizedPointerPosition(e.nativeEvent));
    raycaster.current.setFromCamera(mouse.current, camera);
    if (raycaster.current.ray.intersectPlane(plane.current, intersectionPoint.current)) {
      dragOffset.current.copy(worldPosition).sub(intersectionPoint.current);
    }

    // Mark that this note has been repositioned
    hasBeenRepositioned.current = true;
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!isDragging) return;
    e.stopPropagation?.();

    // Update intersection point with the fixed drag plane
    mouse.current.copy(getNormalizedPointerPosition(e));
    raycaster.current.setFromCamera(mouse.current, camera);
    
    if (raycaster.current.ray.intersectPlane(plane.current, intersectionPoint.current)) {
      // Add the original offset to maintain relative position
      const newPosition = intersectionPoint.current.add(dragOffset.current);
      
      // Prevent going below floor level (accounting for sticky note height)
      newPosition.y = Math.max(FLOOR_LEVEL + HALF_HEIGHT + FLOOR_OFFSET, newPosition.y);
      
      // Update the physics body position
      api.position.set(newPosition.x, newPosition.y, newPosition.z);
      currentPosition.current.copy(newPosition);

      // Wake up nearby bodies to ensure proper collision response
      api.wakeUp();
    }
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!isDragging) return;
    e.stopPropagation?.();
    
    document.body.style.cursor = 'grab';
    setIsDragging(false);
    onDragEnd?.();

    // Re-enable physics with current velocity
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
    if (isDragging || isGlobalDragging || isCursorNoteActive) {
      setIsRightCornerHovered(false);
      return;
    }
    e.stopPropagation();
    setIsRightCornerHovered(true);
  };

  const handleRightCornerPointerLeave = (e: ThreeEvent<PointerEvent>) => {
    if (isDragging || isGlobalDragging || isCursorNoteActive) {
      setIsRightCornerHovered(false);
      return;
    }
    e.stopPropagation();
    setIsRightCornerHovered(false);
  };

  const handleLeftCornerPointerEnter = (e: ThreeEvent<PointerEvent>) => {
    if (isDragging || isGlobalDragging || isCursorNoteActive) {
      setIsLeftCornerHovered(false);
      return;
    }
    e.stopPropagation();
    setIsLeftCornerHovered(true);
  };

  const handleLeftCornerPointerLeave = (e: ThreeEvent<PointerEvent>) => {
    if (isDragging || isGlobalDragging || isCursorNoteActive) {
      setIsLeftCornerHovered(false);
      return;
    }
    e.stopPropagation();
    setIsLeftCornerHovered(false);
  };

  const handleCornerClick = (e: ThreeEvent<MouseEvent>, corner: 'top-right' | 'bottom-right') => {
    e.stopPropagation();
    const worldPosition = new THREE.Vector3();
    (ref.current as THREE.Mesh).getWorldPosition(worldPosition);
    onCornerClick?.(corner, [worldPosition.x, worldPosition.y, worldPosition.z]);
  };

  // Reset corner hover states when global state changes
  useEffect(() => {
    if (isGlobalDragging || isCursorNoteActive) {
      setIsRightCornerHovered(false);
      setIsLeftCornerHovered(false);
    }
  }, [isGlobalDragging, isCursorNoteActive]);

  // Reset corner hover states when dragging starts
  useEffect(() => {
    if (isDragging) {
      setIsRightCornerHovered(false);
      setIsLeftCornerHovered(false);
    }
  }, [isDragging]);

  // Reset physics state when starting to drag
  const resetPhysicsState = () => {
    // Reset settled state when dragging starts
    setHasSettled(false);
    settleTime.current = 0;
    
    api.mass.set(0);
    api.velocity.set(0, 0, 0);
    api.angularVelocity.set(0, 0, 0);
    api.rotation.set(Math.PI/2, 0, 0);
    api.wakeUp();

    // When dragging, move upward to ensure staying on top
    const position = currentPosition.current;
    api.position.set(position.x, position.y + 0.2, position.z);

    // Wake up all nearby bodies with larger radius
    api.applyImpulse([0, 0.1, 0], [position.x, position.y + 3, position.z]);
    
    setIsVisible(true);
  };

  // Function to set up initial drag plane based on camera view
  const setupDragPlane = (worldPosition: THREE.Vector3) => {
    // Set plane normal to camera direction at start of drag
    const normal = new THREE.Vector3(0, 0, 1);
    normal.applyQuaternion(camera.quaternion);
    plane.current.setFromNormalAndCoplanarPoint(normal, worldPosition);
  };

  // Handle dropping the note
  const handleDrop = () => {
    if (!isDragging) return;
    
    document.body.style.cursor = isHovered ? 'grab' : 'auto';
    setIsDragging(false);
    onDragEnd?.();

    // Reset settled state when dropping
    setHasSettled(false);
    settleTime.current = 0;

    // Get exact current position
    const currentPos = new THREE.Vector3();
    (ref.current as THREE.Mesh).getWorldPosition(currentPos);
    lastValidPosition.current.copy(currentPos);

    // Add height to ensure proper stacking
    const finalY = Math.max(currentPos.y, FLOOR_LEVEL + HALF_HEIGHT + FLOOR_OFFSET + STACK_SEPARATION);
    
    // Add slight random offset to prevent perfect stacking
    const randomX = (Math.random() - 0.5) * 0.005;
    const randomZ = (Math.random() - 0.5) * 0.005;
    
    // Reset physics with natural values for dropping
    api.position.set(currentPos.x + randomX, finalY, currentPos.z + randomZ);
    api.velocity.set(randomX * 2, 0.3, randomZ * 2); // Slightly randomized velocity for natural falling
    api.angularVelocity.set(0, 0, 0);
    api.rotation.set(Math.PI/2, 0, 0);
    api.mass.set(0.1);
    api.wakeUp();
  };

  return (
    <mesh
      ref={ref}
      castShadow
      receiveShadow
      visible={isVisible}
      renderOrder={isDroppedNote ? 1000 + creationTime.current % 1000000 : 0} // Extremely high renderOrder for notes
      // Add depth buffer handling to prevent z-fighting
      userData={{ depthTest: true, depthWrite: true }}
      onPointerDown={(e) => {
        e.stopPropagation();
        setIsRightCornerHovered(false);
        setIsLeftCornerHovered(false);
        
        if (isDroppedNote) {
          if (!isDragging && !isGlobalDragging) {
            document.body.style.cursor = 'grabbing';
            
            const worldPosition = new THREE.Vector3();
            (ref.current as THREE.Mesh).getWorldPosition(worldPosition);
            currentPosition.current.copy(worldPosition);
            lastValidPosition.current.copy(worldPosition);

            setIsDragging(true);
            onDragStart?.();
            resetPhysicsState();

            // Set up initial drag plane based on camera view
            setupDragPlane(worldPosition);

            // Calculate intersection point and offset
            mouse.current.copy(getNormalizedPointerPosition(e.nativeEvent));
            raycaster.current.setFromCamera(mouse.current, camera);
            if (raycaster.current.ray.intersectPlane(plane.current, intersectionPoint.current)) {
              dragOffset.current.copy(worldPosition).sub(intersectionPoint.current);
            }
          }
        } else {
          handlePointerDown(e);
        }
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        setIsRightCornerHovered(false);
        setIsLeftCornerHovered(false);
        
        if (isDroppedNote) {
          if (isDragging) {
            handleDrop();
          }
        } else {
          handlePointerUp(e);
        }
      }}
      onPointerEnter={(e) => {
        e.stopPropagation();
        if (isDroppedNote) {
          // For dropped notes, show grab cursor
          if (!isDragging && !isGlobalDragging) {
            document.body.style.cursor = 'grab';
            setIsHovered(true);
            onHoverStart?.();
          }
        } else if (!isCursorNoteActive) { // Only handle hover for pad notes when no cursor note is active
          // Original behavior for pad notes
          handlePointerEnter();
        }
      }}
      onPointerLeave={(e) => {
        e.stopPropagation();
        if (isDroppedNote) {
          // For dropped notes, reset cursor only if not dragging
          if (!isDragging) {
            document.body.style.cursor = 'auto';
            setIsHovered(false);
            onHoverEnd?.();
          }
        } else if (!isCursorNoteActive) { // Only handle hover for pad notes when no cursor note is active
          // Original behavior for pad notes
          handlePointerLeave();
        }
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        if (isDragging) {
          // Ensure cursor stays consistent during dragging
          document.body.style.cursor = 'grabbing';
          
          // Update intersection point with the fixed drag plane
          mouse.current.copy(getNormalizedPointerPosition(e));
          raycaster.current.setFromCamera(mouse.current, camera);
          
          if (raycaster.current.ray.intersectPlane(plane.current, intersectionPoint.current)) {
            // Add the original offset to maintain relative position
            const newPosition = intersectionPoint.current.add(dragOffset.current);
            
            // Update the physics body position
            api.position.set(newPosition.x, newPosition.y, newPosition.z);
            currentPosition.current.copy(newPosition);
          }
        }
      }}
    >
      <boxGeometry args={[1, 1, noteThickness]} />
      <meshStandardMaterial
        ref={materialRef}
        color={color}
        roughness={isDroppedNote ? 0.6 : 0.4}
        metalness={0.0}
        emissive={(isHovered || isDragging) ? color : '#000000'}
        emissiveIntensity={(isHovered || isDragging) ? 0.2 : 0}
        side={THREE.DoubleSide}
        // Add depth write and test settings to help with z-fighting
        depthWrite={true}
        depthTest={true}
      />

      {/* Only show corner hover areas for non-dropped notes and when no cursor note is active */}
      {!isDroppedNote && !isCursorNoteActive && !isGlobalDragging && !isDragging && (
        <>
          {/* Left (top-right) corner hover detection area */}
          <mesh 
            position={[0.35, 0.35, 0]}
            onPointerEnter={(e) => {
              if (isDragging || isGlobalDragging || isCursorNoteActive) return;
              e.stopPropagation();
              handleLeftCornerPointerEnter(e);
              document.body.style.cursor = 'pointer';
            }}
            onPointerLeave={(e) => {
              if (isDragging || isGlobalDragging || isCursorNoteActive) return;
              e.stopPropagation();
              handleLeftCornerPointerLeave(e);
              if (!isRightCornerHovered) {
                document.body.style.cursor = isHovered ? 'grab' : 'auto';
              }
            }}
            onPointerMove={(e) => {
              if (isDragging || isGlobalDragging || isCursorNoteActive) return;
              e.stopPropagation();
              document.body.style.cursor = 'pointer';
            }}
            onClick={(e) => {
              if (isDragging || isGlobalDragging || isCursorNoteActive) return;
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
              if (isDragging || isGlobalDragging || isCursorNoteActive) return;
              e.stopPropagation();
              handleRightCornerPointerEnter(e);
              document.body.style.cursor = 'pointer';
            }}
            onPointerLeave={(e) => {
              if (isDragging || isGlobalDragging || isCursorNoteActive) return;
              e.stopPropagation();
              handleRightCornerPointerLeave(e);
              if (!isLeftCornerHovered) {
                document.body.style.cursor = isHovered ? 'grab' : 'auto';
              }
            }}
            onPointerMove={(e) => {
              if (isDragging || isGlobalDragging || isCursorNoteActive) return;
              e.stopPropagation();
              document.body.style.cursor = 'pointer';
            }}
            onClick={(e) => {
              if (isDragging || isGlobalDragging || isCursorNoteActive) return;
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
              if (isDragging || isGlobalDragging || isCursorNoteActive) return;
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
          {isRightCornerHovered && !isDragging && !isGlobalDragging && !isCursorNoteActive && (
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
          {isLeftCornerHovered && !isDragging && !isGlobalDragging && !isCursorNoteActive && (
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