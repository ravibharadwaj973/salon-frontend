'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FRAGMENT_SHADER, MAX_STRIPS, VERTEX_SHADER } from './shader';
import { hexToLab, measureHair, type HairRange, type Lab } from './recolour';

/**
 * THE PHOTOGRAPH, RECOLOURED ON THE GPU.
 *
 * Two textures in — the generated portrait and the hair cut out of it — and a
 * fragment shader out. Every control the studio offers is a uniform, so a drag of
 * the colour slider is one draw call on two textures: about a millisecond, no
 * network, no bill.
 *
 * ── Why WebGL rather than a 2D canvas ────────────────────────────────────
 *
 * The maths is a round trip through CIELAB per pixel. On a million-pixel portrait
 * that is a few hundred milliseconds in JavaScript — fine for a button, useless
 * for a slider, and a colour slider that lags is one nobody explores with. The
 * whole argument for this architecture is that trying another colour costs
 * nothing, and a quarter-second of lag is not nothing.
 */

export interface PhotoDesign {
  baseColor: string;
  /** 0-100. How far the hair is taken to the target's level. */
  lift: number;
  highlightColor: string;
  highlightAmount: number;
  /** Face-framing only, as against woven through the whole head. */
  highlightFace: boolean;
  rootColor: string;
  rootDepth: number;
  endsColor: string;
  endsAmount: number;
  endsStart: number;
  strips: { id: string; color: string; x: number; y: number; width: number; blend: number; strength: number }[];
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    /*
     * The driver's own message, thrown rather than logged. A shader that fails to
     * compile renders black, and a black picture with a warning in the console is
     * a bug report that says "the hair studio is broken".
     */
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`hair shader failed to compile: ${log ?? 'no reason given'}`);
  }
  return shader;
}

function texture(gl: WebGLRenderingContext, image: HTMLImageElement): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  // CLAMP and LINEAR rather than the defaults: a portrait is not a tiling
  // pattern, and REPEAT wraps the hair at one edge onto the other.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  return tex;
}

/**
 * Load an image we host, as a texture we are allowed to read back.
 *
 * `crossOrigin` matters more than it looks: without it the canvas is tainted the
 * moment the photograph is drawn, and `getImageData` — which measuring the hair
 * depends on — throws a security error. Cloudinary serves the header, so this is
 * the one line that makes the measurement possible at all.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('could not load'));
    image.src = src;
  });
}

export function PhotoRenderer({
  photoUrl,
  maskUrl,
  design,
  onPick,
  className,
}: {
  photoUrl: string;
  maskUrl: string | null;
  design: PhotoDesign;
  /** Where on the picture somebody tapped, 0-1. Only set while painting. */
  onPick?: (spot: { x: number; y: number }) => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<{
    gl: WebGLRenderingContext;
    program: WebGLProgram;
    photo: WebGLTexture;
    mask: WebGLTexture;
  } | null>(null);
  const [range, setRange] = useState<HairRange | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ----------------------------------------------------------------- setup --
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    (async () => {
      try {
        const [photo, mask] = await Promise.all([
          loadImage(photoUrl),
          /*
           * No mask is a legitimate state, not an error: a style can have a
           * photograph before anybody has cut the hair out of it. A fully black
           * mask means "recolour nothing", so the picture shows through
           * untouched and the controls simply have no effect — which is the
           * honest behaviour, and the screen says so in words elsewhere.
           */
          maskUrl ? loadImage(maskUrl) : Promise.resolve(blackPixel()),
        ]);
        if (cancelled) return;

        canvas.width = photo.naturalWidth;
        canvas.height = photo.naturalHeight;

        const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
        if (!gl) throw new Error('no webgl');

        const program = gl.createProgram()!;
        gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
        gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(`hair shader failed to link: ${gl.getProgramInfoLog(program) ?? ''}`);
        }
        gl.useProgram(program);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const aPos = gl.getAttribLocation(program, 'aPos');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        glRef.current = { gl, program, photo: texture(gl, photo), mask: texture(gl, mask) };

        // Measure on a plain 2D canvas: WebGL cannot read a texture back, and the
        // measurement needs the pixels rather than the rendered result.
        setRange(measure(photo, maskUrl ? mask : null));
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'could not start');
      }
    })();

    return () => {
      cancelled = true;
      const held = glRef.current;
      if (held) {
        held.gl.deleteTexture(held.photo);
        held.gl.deleteTexture(held.mask);
        held.gl.deleteProgram(held.program);
        glRef.current = null;
      }
    };
  }, [photoUrl, maskUrl]);

  // ------------------------------------------------------------------ draw --
  const draw = useCallback(() => {
    const held = glRef.current;
    if (!held || !range) return;
    const { gl, program } = held;

    const u = (name: string) => gl.getUniformLocation(program, name);
    const lab = (hex: string): Lab => hexToLab(hex);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, held.photo);
    gl.uniform1i(u('uPhoto'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, held.mask);
    gl.uniform1i(u('uMask'), 1);

    gl.uniform1f(u('uLo'), range.lo);
    gl.uniform1f(u('uSpan'), range.span);
    gl.uniform1f(u('uTop'), range.top);
    gl.uniform1f(u('uBottom'), range.bottom);

    gl.uniform3fv(u('uBase'), lab(design.baseColor));
    gl.uniform1f(u('uLift'), design.lift / 100);

    gl.uniform3fv(u('uHighlight'), lab(design.highlightColor));
    gl.uniform1f(u('uHighlightAmount'), design.highlightAmount / 100);
    gl.uniform1f(u('uHighlightFace'), design.highlightFace ? 1 : 0);

    gl.uniform3fv(u('uRoot'), lab(design.rootColor));
    gl.uniform1f(u('uRootDepth'), design.rootDepth / 100);

    gl.uniform3fv(u('uEnds'), lab(design.endsColor));
    gl.uniform1f(u('uEndsAmount'), design.endsAmount / 100);
    gl.uniform1f(u('uEndsStart'), design.endsStart / 100);

    /*
     * The uniform arrays are always sent at full length, with the unused tail
     * zeroed. A WebGL1 driver is entitled to keep whatever was there before, and
     * a stale section reappearing after it was deleted is the kind of bug that
     * only shows up on one person's laptop.
     */
    const strips = design.strips.slice(0, MAX_STRIPS);
    const pos = new Float32Array(MAX_STRIPS * 2);
    const col = new Float32Array(MAX_STRIPS * 3);
    const shape = new Float32Array(MAX_STRIPS * 3);
    strips.forEach((strip, i) => {
      pos[i * 2] = strip.x;
      pos[i * 2 + 1] = strip.y;
      const [l, a, b] = lab(strip.color);
      col[i * 3] = l;
      col[i * 3 + 1] = a;
      col[i * 3 + 2] = b;
      shape[i * 3] = Math.max(0.02, (strip.width / 100) * 0.3);
      shape[i * 3 + 1] = 0.05 + (strip.blend / 100) * 1.2;
      shape[i * 3 + 2] = strip.strength / 100;
    });
    gl.uniform1i(u('uStripCount'), strips.length);
    gl.uniform2fv(u('uStripPos'), pos);
    gl.uniform3fv(u('uStripColor'), col);
    gl.uniform3fv(u('uStripShape'), shape);

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }, [design, range]);

  useEffect(() => {
    draw();
  }, [draw]);

  if (error) {
    return (
      <div className={className}>
        <p className="flex h-full items-center justify-center p-8 text-center text-sm leading-relaxed text-ink-muted">
          {error === 'no webgl'
            ? 'This browser could not start the colour preview. It needs WebGL, which is usually switched off by a hardware-acceleration setting — everything else on this screen still works.'
            : 'That picture could not be loaded.'}
        </p>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      onPointerDown={
        onPick
          ? (event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              onPick({
                x: (event.clientX - rect.left) / rect.width,
                y: (event.clientY - rect.top) / rect.height,
              });
            }
          : undefined
      }
    />
  );
}

/** A 1×1 black image: "no mask", which the shader reads as "recolour nothing". */
function blackPixel(): HTMLImageElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 1, 1);
  const image = new Image();
  image.src = canvas.toDataURL();
  return image;
}

function measure(photo: HTMLImageElement, mask: HTMLImageElement | null): HairRange {
  if (!mask) return { lo: 0, span: 100, top: 0, bottom: 1, coverage: 0 };
  const w = photo.naturalWidth;
  const h = photo.naturalHeight;

  const read = (image: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  };

  try {
    return measureHair(read(photo), read(mask), w, h);
  } catch {
    /*
     * A tainted canvas, which happens when the images are served without CORS
     * headers. The preview still works — it just normalises against a default
     * range instead of this hair's own, which is a slightly less flattering
     * result rather than a broken screen.
     */
    return { lo: 10, span: 55, top: 0, bottom: 1, coverage: 1 };
  }
}
