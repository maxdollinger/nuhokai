import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

/** Placeholder archipelago: one island in the sea. The scene will be a pure function of server state. */
export function Scene() {
  return (
    <Canvas shadows camera={{ position: [6, 6, 6], fov: 45 }}>
      <color attach="background" args={["#bfe3f2"]} />
      <hemisphereLight args={["#ffffff", "#3a6b7a", 0.8]} />
      <directionalLight position={[5, 10, 3]} intensity={1.5} castShadow />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[20, 64]} />
        <meshStandardMaterial color="#2f7fa3" />
      </mesh>
      <mesh position-y={0.25} castShadow receiveShadow>
        <cylinderGeometry args={[1.6, 2, 0.5, 32]} />
        <meshStandardMaterial color="#d9c38c" />
      </mesh>
      <mesh position-y={0.9} castShadow>
        <sphereGeometry args={[0.8, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#e8f4ff" transparent opacity={0.6} />
      </mesh>
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.2} />
    </Canvas>
  );
}
