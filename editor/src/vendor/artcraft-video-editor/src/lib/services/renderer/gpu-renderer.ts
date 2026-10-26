import {
  applyEffectPasses,
  applyMaskFeather as applyMaskFeatherWasm,
  initializeGpu,
} from "opencut-wasm";
import type { EffectPass, EffectUniformValue } from "../../effects/types";
import {
  applyCustomEffectPass,
  isCustomEffectShader,
} from "./custom-effect-renderer";

let gpuAvailable = false;
let initPromise: Promise<void> | null = null;

async function hasGraphicsBackend(): Promise<boolean> {
  const webgpu = (navigator as Navigator & {
    gpu?: { requestAdapter: () => Promise<unknown | null> };
  }).gpu;
  if (webgpu) {
    try {
      if (await webgpu.requestAdapter()) return true;
    } catch {
      // Continue to the WebGL2 probe.
    }
  }

  const probeCanvas = document.createElement("canvas");
  const webgl = probeCanvas.getContext("webgl2");
  if (!webgl) return false;
  webgl.getExtension("WEBGL_lose_context")?.loseContext();
  return true;
}

export function initializeGpuRenderer(): Promise<void> {
  if (!initPromise) {
    initPromise = hasGraphicsBackend()
      .then((hasBackend) => {
        if (!hasBackend) {
          gpuAvailable = false;
          return;
        }
        return initializeGpu()
          .then(() => {
            gpuAvailable = true;
          })
          .catch((error: unknown) => {
            gpuAvailable = false;
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`GPU renderer unavailable: ${message}`);
          });
      })
      .catch((error: unknown) => {
        gpuAvailable = false;
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`GPU capability check failed: ${message}`);
      });
  }
  return initPromise;
}

export function isGpuAvailable(): boolean {
  return gpuAvailable;
}

export const gpuRenderer = {
  applyEffect({
    source,
    width,
    height,
    passes,
  }: {
    source: OffscreenCanvas;
    width: number;
    height: number;
    passes: EffectPass[];
  }): OffscreenCanvas {
    if (passes.length === 0 || !gpuAvailable) {
      return source;
    }

    let current = source;
    for (let index = 0; index < passes.length; ) {
      if (isCustomEffectShader(passes[index]!.shader)) {
        current = applyCustomEffectPass({
          source: current,
          width,
          height,
          pass: passes[index]!,
        });
        index += 1;
        continue;
      }

      let end = index + 1;
      while (end < passes.length && !isCustomEffectShader(passes[end]!.shader)) {
        end += 1;
      }
      current = applyEffectPasses({
        source: current,
        width,
        height,
        passes: serializeEffectPasses(passes.slice(index, end)),
      });
      index = end;
    }
    return current;
  },

  applyMaskFeather({
    maskCanvas,
    width,
    height,
    feather,
  }: {
    maskCanvas: OffscreenCanvas;
    width: number;
    height: number;
    feather: number;
  }): OffscreenCanvas {
    if (!gpuAvailable) {
      return maskCanvas;
    }

    return applyMaskFeatherWasm({
      mask: maskCanvas,
      width,
      height,
      feather,
    });
  },
};

function serializeEffectPasses(passes: EffectPass[]) {
  return passes.map((pass) => ({
    shader: pass.shader,
    uniforms: Object.entries(pass.uniforms).map(([name, value]) => ({
      name,
      value: normalizeUniformValue(value),
    })),
  }));
}

function normalizeUniformValue(value: EffectUniformValue): number[] {
  return typeof value === "number" ? [value] : value;
}
