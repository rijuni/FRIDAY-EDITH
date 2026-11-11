import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';

function PulsingOrb({ isStreaming }) {
  const meshRef = useRef();

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += isStreaming ? delta * 1.5 : delta * 0.4;
      meshRef.current.rotation.x += isStreaming ? delta * 0.8 : delta * 0.2;
    }
  });

  return (
    <mesh ref={meshRef} scale={isStreaming ? 1.4 : 1.15}>
      <sphereGeometry args={[1.2, 32, 32]} />
      <meshStandardMaterial
        color={isStreaming ? "#06b6d4" : "#8b5cf6"}
        emissive={isStreaming ? "#06b6d4" : "#6d28d9"}
        emissiveIntensity={isStreaming ? 0.9 : 0.5}
        roughness={0.2}
        metalness={0.8}
        wireframe={true}
      />
    </mesh>
  );
}

export function NebulaCore3D({ isStreaming }) {
  return (
    <div className="relative w-28 h-28 flex items-center justify-center">
      {/* Ambient background glow */}
      <div className={`absolute inset-0 rounded-full blur-2xl transition-all duration-700 ${
        isStreaming ? 'bg-cyan-500/40' : 'bg-violet-600/30'
      }`} />

      {/* 3D Canvas */}
      <Canvas camera={{ position: [0, 0, 3.2] }}>
        <ambientLight intensity={0.7} />
        <pointLight position={[5, 5, 5]} intensity={1.5} color="#06b6d4" />
        <pointLight position={[-5, -5, -5]} intensity={1} color="#ec4899" />
        <PulsingOrb isStreaming={isStreaming} />
      </Canvas>
    </div>
  );
}

