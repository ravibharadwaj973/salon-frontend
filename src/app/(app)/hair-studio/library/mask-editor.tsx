'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Brush, Eraser, Undo2, Wand2 } from 'lucide-react';
import { apiPost, errorMessage } from '@/lib/client';
import type { HairPose } from '../catalogue-types';
import { Button } from '@/components/ui/button';
import { Modal, useToast } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import { rgbToLab } from '../photo/recolour';

/**
 * CUT THE HAIR OUT OF THE PICTURE. ONCE.
 *
 * ── Why a person does this and not an algorithm ───────────────────────────
 *
 * Blind segmentation was written first and tested on a real salon portrait. It
 * selected the WALL. The backdrop was a soft gradient rather than a flat colour,
 * so the flood from the border stopped early, and the largest region that was
 * neither skin nor border turned out to be the background itself — confidently,
 * with no error. A rule that wrong is worse than no rule, because the only
 * symptom is a studio where the colours land on the backdrop.
 *
 * A tap is different in kind: a person saying "this is hair" is the one piece of
 * information no heuristic has. The wand then does the tedious part, which is
 * following every curl to its tip.
 *
 * ── Why this is worth twenty seconds of somebody's afternoon ──────────────
 *
 * Because it is paid once per style and it buys every colour forever. Without a
 * mask, showing a customer a different colour means another call to the image
 * model — billed per picture, a wait, and a face that comes back subtly
 * different. With one, eight hundred combinations are a shader.
 */

/** Distance in LAB, which is where "similar hair tones" actually means something. */
const DEFAULT_TOLERANCE = 14;

export function MaskEditor({
  open,
  onClose,
  catalogId,
  pose,
  photoUrl,
  existingMaskUrl,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  catalogId: string;
  /**
   * WHICH ANGLE IS BEING CUT OUT. Absent means the front one.
   *
   * A mask belongs to one photograph and cannot be shared: hair occupies
   * completely different pixels from the side than from the front, so sending a
   * side mask to the front slot would paint colour onto a cheek — and do it
   * convincingly enough to ship.
   */
  pose?: HairPose;
  photoUrl: string;
  existingMaskUrl: string | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoRef = useRef<ImageData | null>(null);
  const labRef = useRef<Float32Array | null>(null);
  const maskRef = useRef<Uint8ClampedArray | null>(null);
  const undoRef = useRef<Uint8ClampedArray[]>([]);

  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [tool, setTool] = useState<'wand' | 'brush' | 'eraser'>('wand');
  const [tolerance, setTolerance] = useState(DEFAULT_TOLERANCE);
  const [brush, setBrush] = useState(24);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [coverage, setCoverage] = useState(0);

  /** Redraw the photo with the mask over it, so the edge is visible as you work. */
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const photo = photoRef.current;
    const mask = maskRef.current;
    if (!canvas || !photo || !mask) return;
    const ctx = canvas.getContext('2d')!;
    const out = ctx.createImageData(photo.width, photo.height);

    let inside = 0;
    for (let i = 0; i < mask.length; i += 1) {
      const p = i * 4;
      const m = mask[i]! / 255;
      if (m > 0.5) inside += 1;
      /*
       * Selected hair keeps its own colours; everything else is dimmed and
       * pushed towards blue. Showing the mask as flat white would hide exactly
       * what is being judged — whether the edge follows the curls — and a tint
       * leaves the hair readable underneath.
       */
      out.data[p] = photo.data[p]! * (0.25 + 0.75 * m);
      out.data[p + 1] = photo.data[p + 1]! * (0.25 + 0.75 * m);
      out.data[p + 2] = photo.data[p + 2]! * (0.25 + 0.75 * m) + (1 - m) * 60;
      out.data[p + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    setCoverage(inside / mask.length);
  }, []);

  // --------------------------------------------------------------- loading --
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('could not load'));
        image.src = src;
      });

    (async () => {
      try {
        const image = await load(photoUrl);
        if (cancelled) return;

        /*
         * Worked at a bounded size rather than at full resolution. A flood fill
         * over a megapixel in JavaScript is seconds of a frozen tab, and a mask
         * is a soft silhouette — it loses nothing at 720 across and is scaled
         * back up by the GPU when it is used.
         */
        const scale = Math.min(1, 720 / Math.max(image.naturalWidth, image.naturalHeight));
        const w = Math.round(image.naturalWidth * scale);
        const h = Math.round(image.naturalHeight * scale);

        const canvas = canvasRef.current!;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(image, 0, 0, w, h);
        const photo = ctx.getImageData(0, 0, w, h);
        photoRef.current = photo;

        // LAB once, up front: the wand compares thousands of pixels per flood and
        // converting inside that loop was the difference between instant and
        // noticeable.
        const lab = new Float32Array(w * h * 3);
        for (let i = 0; i < w * h; i += 1) {
          const p = i * 4;
          const [L, A, B] = rgbToLab([photo.data[p]! / 255, photo.data[p + 1]! / 255, photo.data[p + 2]! / 255]);
          lab[i * 3] = L;
          lab[i * 3 + 1] = A;
          lab[i * 3 + 2] = B;
        }
        labRef.current = lab;

        const mask = new Uint8ClampedArray(w * h);
        if (existingMaskUrl) {
          try {
            const previous = await load(existingMaskUrl);
            const scratch = document.createElement('canvas');
            scratch.width = w;
            scratch.height = h;
            const sctx = scratch.getContext('2d', { willReadFrequently: true })!;
            sctx.drawImage(previous, 0, 0, w, h);
            const data = sctx.getImageData(0, 0, w, h).data;
            for (let i = 0; i < w * h; i += 1) mask[i] = data[i * 4]!;
          } catch {
            // An unreadable previous mask starts a fresh one rather than failing
            // the editor: re-cutting is twenty seconds, and being locked out is not.
          }
        }
        maskRef.current = mask;
        undoRef.current = [];

        if (!cancelled) {
          setSize({ w, h });
          paint();
        }
      } catch {
        if (!cancelled) toast.error('That photograph could not be opened for editing.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, photoUrl, existingMaskUrl, paint, toast]);

  // ----------------------------------------------------------------- tools --
  const remember = () => {
    const mask = maskRef.current;
    if (!mask) return;
    undoRef.current.push(new Uint8ClampedArray(mask));
    // Ten steps. Each is a copy of the mask, and an unbounded stack of them on a
    // long session is tens of megabytes for something nobody walks back that far.
    if (undoRef.current.length > 10) undoRef.current.shift();
  };

  const wand = (sx: number, sy: number) => {
    const photo = photoRef.current;
    const lab = labRef.current;
    const mask = maskRef.current;
    if (!photo || !lab || !mask) return;

    const { width: w, height: h } = photo;
    const seed = sy * w + sx;
    const ref = [lab[seed * 3]!, lab[seed * 3 + 1]!, lab[seed * 3 + 2]!];

    /*
     * An explicit stack rather than recursion, and a typed array rather than a
     * Set. A flood over half a million pixels recurses deeper than any JS engine
     * will allow, and the naive version crashed the tab on the first full head.
     */
    const stack = new Int32Array(w * h);
    let top = 0;
    stack[top++] = seed;
    const seen = new Uint8Array(w * h);
    seen[seed] = 1;

    while (top > 0) {
      const i = stack[--top]!;
      mask[i] = 255;
      const x = i % w;
      const y = (i / w) | 0;

      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (seen[n]) continue;
        const dL = lab[n * 3]! - ref[0]!;
        const dA = lab[n * 3 + 1]! - ref[1]!;
        const dB = lab[n * 3 + 2]! - ref[2]!;
        if (Math.sqrt(dL * dL + dA * dA + dB * dB) < tolerance) {
          seen[n] = 1;
          stack[top++] = n;
        }
      }
    }
    paint();
  };

  const stroke = (sx: number, sy: number, add: boolean) => {
    const photo = photoRef.current;
    const mask = maskRef.current;
    if (!photo || !mask) return;
    const { width: w, height: h } = photo;
    const r = brush;
    for (let y = Math.max(0, sy - r); y < Math.min(h, sy + r); y += 1) {
      for (let x = Math.max(0, sx - r); x < Math.min(w, sx + r); x += 1) {
        const d = Math.hypot(x - sx, y - sy);
        if (d > r) continue;
        // A soft edge on the brush as well as on the flood: a mask with a hard
        // rim produces a hard rim in the recolour, which reads as a cut-out.
        const k = 1 - Math.min(1, Math.max(0, (d - r * 0.6) / (r * 0.4)));
        const i = y * w + x;
        mask[i] = add ? Math.max(mask[i]!, 255 * k) : Math.min(mask[i]!, 255 * (1 - k));
      }
    }
    paint();
  };

  const drawing = useRef(false);

  const at = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const photo = photoRef.current!;
    return {
      x: Math.floor(((event.clientX - rect.left) / rect.width) * photo.width),
      y: Math.floor(((event.clientY - rect.top) / rect.height) * photo.height),
    };
  };

  async function save() {
    const photo = photoRef.current;
    const mask = maskRef.current;
    if (!photo || !mask) return;

    if (coverage < 0.01) {
      toast.error('Nothing is selected yet — tap the hair first.');
      return;
    }

    setSaving(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = photo.width;
      canvas.height = photo.height;
      const ctx = canvas.getContext('2d')!;
      const out = ctx.createImageData(photo.width, photo.height);
      for (let i = 0; i < mask.length; i += 1) {
        const p = i * 4;
        out.data[p] = out.data[p + 1] = out.data[p + 2] = mask[i]!;
        out.data[p + 3] = 255;
      }
      ctx.putImageData(out, 0, 0);

      // PNG, not JPEG. A mask is a hard-edged greyscale silhouette and JPEG's
      // ringing around those edges would appear in the recolour as a halo.
      await apiPost(`hair-studio/hairstyles/${catalogId}/mask`, {
        mask: canvas.toDataURL('image/png'),
        ...(pose ? { pose } : {}),
      });
      toast.success('Hair cut out — every colour is instant from now on');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cut out the hair"
      description="Tap the hair a few times, then tidy the edges. Once, and every colour in the studio is free after it."
      size="xl"
      footer={
        <>
          <span className="mr-auto text-2xs text-ink-subtle">
            {size ? `${Math.round(coverage * 100)}% of the picture selected` : 'Opening…'}
          </span>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} disabled={!size || busy}>
            Save the cut-out
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['wand', Wand2, 'Tap the hair'],
              ['brush', Brush, 'Add'],
              ['eraser', Eraser, 'Remove'],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTool(key)}
              aria-pressed={tool === key}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-2xs font-medium transition-colors',
                tool === key ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-stone-200 text-ink-muted hover:text-ink',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => {
              const previous = undoRef.current.pop();
              if (!previous || !maskRef.current) return;
              maskRef.current.set(previous);
              paint();
            }}
            className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5 text-2xs font-medium text-ink-muted hover:text-ink"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden />
            Undo
          </button>

          <label className="ml-auto flex items-center gap-2 text-2xs text-ink-subtle">
            {tool === 'wand' ? 'How much it grabs' : 'Brush size'}
            <input
              type="range"
              min={tool === 'wand' ? 4 : 4}
              max={tool === 'wand' ? 40 : 80}
              value={tool === 'wand' ? tolerance : brush}
              onChange={(event) =>
                tool === 'wand' ? setTolerance(Number(event.target.value)) : setBrush(Number(event.target.value))
              }
              className="h-1.5 w-28 cursor-pointer appearance-none rounded-full bg-stone-200 accent-brand-600"
            />
          </label>
        </div>

        <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-900">
          <canvas
            ref={canvasRef}
            className="mx-auto max-h-[58vh] w-auto cursor-crosshair touch-none"
            onPointerDown={(event) => {
              if (!photoRef.current) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              remember();
              setBusy(true);
              const { x, y } = at(event);
              if (tool === 'wand') wand(x, y);
              else {
                drawing.current = true;
                stroke(x, y, tool === 'brush');
              }
              setBusy(false);
            }}
            onPointerMove={(event) => {
              if (!drawing.current || tool === 'wand') return;
              const { x, y } = at(event);
              stroke(x, y, tool === 'brush');
            }}
            onPointerUp={() => {
              drawing.current = false;
            }}
          />
        </div>

        <p className="text-2xs leading-relaxed text-ink-subtle">
          Tapping grabs everything connected and similar in tone, so two or three taps usually take a whole head. Turn
          &ldquo;how much it grabs&rdquo; down if it runs onto the face or the background, then fix the last few edges
          with the brush.
        </p>
      </div>
    </Modal>
  );
}
