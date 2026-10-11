import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

/* A GPU-animated wave of ~9k particles. Motion runs entirely in the vertex shader,
   so the CPU only updates two uniforms per frame. Reacts to the pointer. */
const vertex = /* glsl */ `
  uniform float uTime;
  uniform vec2 uMouse;
  attribute float aSeed;
  varying float vGlow;
  varying float vMix;
  void main() {
    vec3 p = position;
    float d = distance(p.xz, uMouse * vec2(9.0, 5.0));
    float wave = sin(p.x * 0.55 + uTime * 0.8) * 0.45 + cos(p.z * 0.7 + uTime * 0.6) * 0.35;
    float ripple = exp(-d * 0.55) * sin(d * 3.0 - uTime * 4.0) * 0.6;
    p.y += wave + ripple;
    vGlow = 0.35 + exp(-d * 0.4) * 0.9;
    vMix = aSeed;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (2.2 + aSeed * 2.0) * (8.0 / -mv.z) * (1.0 + exp(-d * 0.6));
    gl_Position = projectionMatrix * mv;
  }
`;
const fragment = /* glsl */ `
  varying float vGlow;
  varying float vMix;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    vec3 teal = vec3(0.204, 0.827, 0.706);
    vec3 violet = vec3(0.545, 0.486, 0.965);
    vec3 col = mix(violet, teal, vMix);
    float a = smoothstep(0.5, 0.0, r) * vGlow;
    gl_FragColor = vec4(col, a * 0.85);
  }
`;

function Wave() {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const mouse = useRef(new THREE.Vector2(0, 0));
  const { pointer } = useThree();
  const geo = useMemo(() => {
    const cols = 140, rows = 64;
    const pos = new Float32Array(cols * rows * 3);
    const seed = new Float32Array(cols * rows);
    let i = 0;
    for (let x = 0; x < cols; x++)
      for (let z = 0; z < rows; z++) {
        pos.set([(x / cols - 0.5) * 22, 0, (z / rows - 0.5) * 11], i * 3);
        seed[i++] = Math.random();
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    return g;
  }, []);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uMouse: { value: new THREE.Vector2() } }), []);

  useFrame((_, dt) => {
    if (!mat.current) return;
    mat.current.uniforms.uTime.value += dt;
    mouse.current.lerp(pointer, 0.06);
    mat.current.uniforms.uMouse.value.copy(mouse.current);
  });

  return (
    <points geometry={geo} rotation={[-0.08, 0, 0]}>
      <shaderMaterial ref={mat} vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

export default function ParticleField({ className }: { className?: string }) {
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <div className={className} aria-hidden>
      <Canvas camera={{ position: [0, 3.2, 8], fov: 55 }} dpr={[1, 1.75]} gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }} frameloop={reduced ? 'demand' : 'always'} eventSource={document.body} eventPrefix="client">
        <Wave />
      </Canvas>
    </div>
  );
}
