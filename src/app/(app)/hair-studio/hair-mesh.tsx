'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { FaceShape } from '../hairstyles/types';
import { generateHair, type GenerateOptions } from './hair/generate';
import type { DesignSpec } from './hair/spec';

/**
 * The generated hair, handed to the GPU.
 *
 * One mesh for the whole head. Two thousand separate objects would be two
 * thousand draw calls and a slideshow; the cards are built into a single buffer
 * and drawn once.
 *
 * Regeneration is memoised on the spec, so dragging a colour picker rebuilds
 * only the colour attribute's worth of work rather than the geometry — React
 * reruns the generator, but the generator is about fifteen milliseconds and the
 * alternative is a separate colour-only path that would drift from this one.
 */
export function HairMesh({
  spec,
  face,
  options,
}: {
  spec: DesignSpec;
  face: FaceShape;
  options: GenerateOptions;
}) {
  const ref = useRef<THREE.BufferGeometry>(null);

  const data = useMemo(
    () => generateHair(spec, { ...options, face }),
    // The spec is rebuilt by the controls on every change, so identity is the
    // right dependency; a deep compare here would cost more than it saved.
    [spec, face, options],
  );

  useLayoutEffect(() => {
    const geometry = ref.current;
    if (!geometry) return;
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    // Without this the hair inherits whatever sphere was here last and vanishes
    // the moment the camera moves past the old bounds.
    geometry.computeBoundingSphere();
  }, [data]);

  return (
    <mesh castShadow frustumCulled={false}>
      <bufferGeometry ref={ref} />
      {/*
        DoubleSide because a card is a flat ribbon and you see its back half the
        time. Low roughness with a little sheen is what separates hair from
        felt; fully rough reads as wool.
      */}
      <meshStandardMaterial
        vertexColors
        side={THREE.DoubleSide}
        roughness={0.42}
        metalness={0.05}
        envMapIntensity={0.6}
      />
    </mesh>
  );
}
