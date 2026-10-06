'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as THREE from 'three';
import type { FaceShape } from './catalogue-types';
import { HairMesh } from './hair-mesh';
import { Lights, Mannequin, Salon } from './scene';
import type { GenerateOptions } from './hair/generate';
import type { DesignSpec } from './hair/spec';
import { VIEWS, type ViewName } from './views';

const TARGET = new THREE.Vector3(0, -0.9, 0);

/**
 * Flies the camera to a preset and then gets out of the way.
 *
 * Snapping is disorienting — you lose track of which side of the head you are
 * looking at, which is the one thing the angle buttons exist to tell you. The
 * animation stops as soon as it is close enough, so dragging straight after
 * pressing a button is never fought.
 */
function CameraRig({ view, nonce }: { view: ViewName; nonce: number }) {
  const { camera, controls } = useThree();
  const goal = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    goal.current = new THREE.Vector3(...VIEWS[view]);
  }, [view, nonce]);

  useFrame((_, delta) => {
    if (!goal.current) return;
    const k = 1 - Math.pow(0.0001, delta);
    camera.position.lerp(goal.current, k);
    const orbit = controls as { target?: THREE.Vector3; update?: () => void } | null;
    orbit?.target?.lerp(TARGET, k);
    orbit?.update?.();
    if (camera.position.distanceTo(goal.current) < 0.02) goal.current = null;
  });

  return null;
}

/** Cancels a fly-to the moment the person takes the camera themselves. */
function StopOnDrag({ onDrag }: { onDrag: () => void }) {
  const { controls } = useThree();
  useEffect(() => {
    const orbit = controls as unknown as { addEventListener?: (e: string, f: () => void) => void; removeEventListener?: (e: string, f: () => void) => void } | null;
    if (!orbit?.addEventListener) return;
    orbit.addEventListener('start', onDrag);
    return () => orbit.removeEventListener?.('start', onDrag);
  }, [controls, onDrag]);
  return null;
}

/**
 * IMAGE-BASED LIGHTING, BUILT RATHER THAN DOWNLOADED.
 *
 * Anisotropic hair needs something to reflect. Three point lights give it four
 * hard glints and nothing in between; what makes hair look expensive is a soft
 * environment wrapping round it, so the highlight travels as the head turns.
 *
 * RoomEnvironment is a little box of emissive panels that ships inside three
 * itself, so this costs no HDRI download, no CDN and no extra megabyte — which
 * matters for a salon on a phone connection.
 */
function Studio() {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    scene.environment = target.texture;
    return () => {
      // Both, or the texture leaks every time the studio is reopened.
      target.dispose();
      pmrem.dispose();
      scene.environment = null;
    };
  }, [gl, scene]);

  return null;
}

export function Viewport({
  spec,
  face,
  options,
  view,
  viewNonce,
  onUserTookCamera,
}: {
  spec: DesignSpec;
  face: FaceShape;
  options: GenerateOptions;
  view: ViewName;
  viewNonce: number;
  onUserTookCamera: () => void;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="max-w-sm text-sm text-ink-muted">
          This browser could not start 3D. The studio needs WebGL, which is usually turned off by a hardware-acceleration
          setting rather than missing — everything else in Parlon works without it.
        </p>
      </div>
    );
  }

  return (
    <Canvas
      shadows
      // Capped rather than uncapped: a retina screen at full ratio quadruples
      // the pixels for a difference nobody sees on hair this fine.
      dpr={[1, 1.75]}
      camera={{ position: [...VIEWS.FRONT], fov: 32, near: 0.1, far: 60 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.92;
      }}
      onError={() => setFailed(true)}
    >
      <color attach="background" args={['#efe9e2']} />
      <fog attach="fog" args={['#efe9e2', 9, 20]} />

      <Studio />
      <Lights />
      <Salon />
      <Mannequin face={face} spec={spec} options={options} />
      <HairMesh spec={spec} face={face} options={options} />

      <OrbitControls
        makeDefault
        target={TARGET}
        enablePan={false}
        minDistance={3.5}
        maxDistance={14}
        // Stops short of the floor and the ceiling: there is nothing to learn
        // from underneath a haircut, and getting stuck under one is annoying.
        minPolarAngle={0.5}
        maxPolarAngle={2.1}
        enableDamping
        dampingFactor={0.08}
      />
      <CameraRig view={view} nonce={viewNonce} />
      <StopOnDrag onDrag={onUserTookCamera} />
    </Canvas>
  );
}
