'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import type { FaceShape } from './catalogue-types';
import { hairlinePolar, headRadius, noseBulge } from './hair/head-shape';
import { hexToLinear } from './hair/colour';
import { strandLength, type GenerateOptions } from './hair/generate';
import type { DesignSpec } from './hair/spec';

/**
 * THE ROOM, AND THE HEAD IN IT.
 *
 * A styling head rather than a person. That is a decision, not a shortcut: a
 * half-modelled face lands squarely in the uncanny valley, and a salon's own
 * mannequin is a thing every stylist already reads correctly. The nose stays,
 * because without it nobody can tell the front of a bald head from the back.
 *
 * Everything in the room is boxes and cylinders. The hair is what is being
 * judged here, and every triangle spent on a shampoo bottle is a triangle not
 * spent on a strand.
 */

const SKIN = '#d8cec4';
const SKIN_LINEAR = hexToLinear(SKIN);

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0 || 1));
  return t * t * (3 - 2 * t);
};

export function Mannequin({
  face,
  spec,
  options,
}: {
  face: FaceShape;
  spec: DesignSpec;
  options: GenerateOptions;
}) {
  const geometry = useMemo(() => {
    const sphere = new THREE.SphereGeometry(1, 72, 54);
    const position = sphere.attributes.position as THREE.BufferAttribute;
    const colours = new Float32Array(position.count * 3);

    /*
     * THE SCALP IS TINTED WITH THE HAIR COLOUR, AND IT IS WHY THIS LOOKS LIKE
     * HAIR AT ALL.
     *
     * A few thousand cards can never close every gap, so without this you see
     * grey plastic between the strands and the whole head reads as thinning
     * and spiky. Tinting the scalp underneath means a gap reads as the shadow
     * between locks, which is what a gap in real hair is.
     *
     * Driven by the SAME strandLength the hair uses, so it follows the cut for
     * free: a faded side gets a dark shadow where the stubble is and bare
     * plastic where the clippers took it to skin.
     */
    const hair = hexToLinear(spec.baseColor);
    const scalp: [number, number, number] = [hair[0] * 0.4, hair[1] * 0.4, hair[2] * 0.4];

    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const length = Math.hypot(x, y, z) || 1;
      const ux = x / length;
      const uy = y / length;
      const uz = z / length;
      // The same function the hair roots use, so the two cannot disagree about
      // where the scalp is.
      const r = headRadius(ux, uy, uz, face) + noseBulge(ux, uy, uz);
      position.setXYZ(i, ux * r, uy * r, uz * r);

      const phi = Math.atan2(ux, uz);
      const theta = Math.acos(Math.max(-1, Math.min(1, uy)));
      const max = hairlinePolar(phi);
      let k = 0;
      if (theta <= max) {
        const t = clamp01(theta / max);
        const grown = strandLength(
          spec,
          { x: ux, y: uy, z: uz, phi, t, frontness: (Math.cos(phi) + 1) / 2, r0: 0.5, r1: 0.5, r2: 0.5, r3: 0.5 },
          { ...options, face },
        );
        // Feathered at the hairline, where you really do see scalp.
        k = smoothstep(0.015, 0.07, grown) * (1 - smoothstep(0.9, 1.02, t));
      }

      colours[i * 3] = SKIN_LINEAR[0] + (scalp[0] - SKIN_LINEAR[0]) * k;
      colours[i * 3 + 1] = SKIN_LINEAR[1] + (scalp[1] - SKIN_LINEAR[1]) * k;
      colours[i * 3 + 2] = SKIN_LINEAR[2] + (scalp[2] - SKIN_LINEAR[2]) * k;
    }

    position.needsUpdate = true;
    sphere.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    sphere.computeVertexNormals();
    return sphere;
  }, [face, spec, options]);

  return (
    <group>
      {/* White base colour: the tint lives entirely in the vertex colours, and
          a material colour would multiply it a second time. */}
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial vertexColors color="#ffffff" roughness={0.78} metalness={0} />
      </mesh>

      {/* Neck */}
      <mesh position={[0, -1.3, 0.02]} castShadow>
        <cylinderGeometry args={[0.3, 0.37, 0.75, 32]} />
        <meshStandardMaterial color={SKIN} roughness={0.8} metalness={0} />
      </mesh>

      {/* Shoulders — long hair has to land on something. Wide and shallow:
          the first pass was a drum, and the model looked like a cake. */}
      <mesh position={[0, -1.84, 0]} scale={[1.42, 0.34, 0.5]} castShadow receiveShadow>
        <sphereGeometry args={[1, 44, 28]} />
        <meshStandardMaterial color="#8d8278" roughness={0.9} metalness={0} />
      </mesh>
      <mesh position={[0, -2.6, 0]} scale={[1, 1, 0.52]}>
        <cylinderGeometry args={[0.95, 1.0, 1.6, 36]} />
        <meshStandardMaterial color="#8d8278" roughness={0.9} metalness={0} />
      </mesh>
    </group>
  );
}

function Chair() {
  return (
    <group position={[0, -2.1, 0]}>
      {/* Back */}
      <mesh position={[0, -0.55, -0.6]} castShadow>
        <boxGeometry args={[1.5, 1.9, 0.22]} />
        <meshStandardMaterial color="#2b2724" roughness={0.6} metalness={0.05} />
      </mesh>
      {/* Seat */}
      <mesh position={[0, -1.5, 0.05]} castShadow>
        <boxGeometry args={[1.6, 0.26, 1.4]} />
        <meshStandardMaterial color="#2b2724" roughness={0.6} metalness={0.05} />
      </mesh>
      {/* Column and base */}
      <mesh position={[0, -2.35, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 1.5, 20]} />
        <meshStandardMaterial color="#6b6460" roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[0, -3.1, 0]} receiveShadow>
        <cylinderGeometry args={[0.78, 0.86, 0.12, 36]} />
        <meshStandardMaterial color="#4a4542" roughness={0.4} metalness={0.6} />
      </mesh>
    </group>
  );
}

function Station() {
  return (
    <group position={[0, 0, -2.6]}>
      {/* Mirror. Dark glass rather than a true reflection: reflecting the scene
          means drawing two thousand hair cards twice a frame, and the hair is
          what the person is actually looking at. */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[2.6, 3.4, 0.08]} />
        <meshStandardMaterial color="#b9a898" roughness={0.45} metalness={0.35} />
      </mesh>
      {/* Glass, not a mirror. A metal plane with nothing to reflect renders
          black, which read as a hole in the wall rather than as a mirror. */}
      <mesh position={[0, 0.5, 0.05]}>
        <planeGeometry args={[2.35, 3.15]} />
        <meshStandardMaterial color="#aab4bd" roughness={0.22} metalness={0.5} />
      </mesh>

      {/* Counter and a couple of bottles — enough to say "salon" and no more. */}
      <mesh position={[0, -1.5, 0.45]} receiveShadow castShadow>
        <boxGeometry args={[3.2, 0.14, 0.85]} />
        <meshStandardMaterial color="#efe7dd" roughness={0.5} metalness={0.05} />
      </mesh>
      {[-1.1, -0.82, 1.0].map((x, index) => (
        <mesh key={x} position={[x, -1.2, 0.5]} castShadow>
          <cylinderGeometry args={[0.09, 0.1, 0.52 + index * 0.08, 18]} />
          <meshStandardMaterial color={index === 2 ? '#c86f3c' : '#d8d2ca'} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

export function Salon() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.2, 0]} receiveShadow>
        <planeGeometry args={[26, 26]} />
        <meshStandardMaterial color="#b4a89c" roughness={0.92} metalness={0} />
      </mesh>
      <mesh position={[0, 2.5, -3.4]} receiveShadow>
        <planeGeometry args={[26, 14]} />
        <meshStandardMaterial color="#e3dbd2" roughness={1} metalness={0} />
      </mesh>
      <Chair />
      <Station />
    </group>
  );
}

/**
 * The lighting, and the one light that matters.
 *
 * The rim from behind is not decoration: hair reads as hair because light
 * passes along its length and catches the outline. Without it a head of hair is
 * a dark lump, however good the geometry underneath.
 */
export function Lights() {
  return (
    <>
      {/*
        REBALANCED FOR THE ENVIRONMENT MAP.
        
        These values were tuned when three lights were ALL the light there was.
        Adding image-based lighting on top without touching them doubled the
        exposure: a dark brown rendered as blonde and the room went white. The
        environment now supplies the ambient fill, so the hemisphere is a trim
        rather than a light source.
      */}
      <hemisphereLight args={['#fff6ec', '#7a6d62', 0.22]} />
      {/*
        Tightened onto the head and doubled in resolution. At 1024 across ten
        units the hair's own shadow fell on the face in hard blotches, which
        read as dirt rather than as shade.
      */}
      <directionalLight
        position={[3.5, 5, 4.5]}
        intensity={1.05}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={16}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3.5}
        shadow-camera-bottom={-3.5}
        shadow-bias={-0.0008}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-4.5, 2, 3]} intensity={0.28} color="#dfe8ff" />
      {/* The rim stays strong. It is what draws the outline of the hair, and
          the environment cannot do that job — it has no direction. */}
      <directionalLight position={[0, 3.5, -5]} intensity={1.15} color="#ffd9b0" />
    </>
  );
}
