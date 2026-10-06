'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { FaceShape } from './catalogue-types';
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
    // Four components: direction plus handedness, which is what the renderer's
    // anisotropy expects. Without it the highlight falls back to a round dot
    // and the hair reads as felt.
    geometry.setAttribute('tangent', new THREE.BufferAttribute(data.tangents, 4));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    // Without this the hair inherits whatever sphere was here last and vanishes
    // the moment the camera moves past the old bounds.
    geometry.computeBoundingSphere();
  }, [data]);

  return (
    <mesh castShadow frustumCulled={false}>
      <bufferGeometry ref={ref} />
      {/*
        WHY THIS IS A PHYSICAL MATERIAL AND NOT A STANDARD ONE.

        `anisotropy` is the whole reason. A highlight on hair is not a dot, it
        is a band running ACROSS the strands — that travelling sheen is the
        single most recognisable thing about hair, and a standard material
        cannot produce it however the roughness is tuned. With the tangent
        attribute above, the renderer stretches the specular lobe along each
        strand and the band appears for free.

        `sheen` adds the soft retroreflective glow at the silhouette, which is
        light scattering through the outer layer. `clearcoat` is the polished
        top layer a blow-dry leaves, and it is kept low: at 1 the hair looks
        wet, which is a different hairstyle.

        DoubleSide because a card is a flat ribbon and you see its back half
        the time.
      */}
      <meshPhysicalMaterial
        vertexColors
        side={THREE.DoubleSide}
        roughness={0.52}
        metalness={0}
        /*
         * Turned right down from the first pass. Anisotropy, sheen and
         * clearcoat are three SEPARATE white speculars, and at 0.85/0.22/0.18
         * they stacked into a wash that swallowed the base colour — a dark
         * brown rendered as pale caramel. Clearcoat is gone entirely: its lobe
         * uses the smooth sphere normal, so it painted one huge glossy sheet
         * across the whole head instead of following the strands.
         */
        anisotropy={0.5}
        anisotropyRotation={0}
        specularIntensity={0.55}
        sheen={0.1}
        sheenRoughness={0.75}
        sheenColor={new THREE.Color('#ffd9b8')}
        envMapIntensity={0.32}
      />
    </mesh>
  );
}
