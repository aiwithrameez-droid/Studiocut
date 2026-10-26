import type { EffectDefinition } from "../types";
import { FOOTAGE_NOISE_REDUCTION_SHADER } from "../custom-shader-ids";

export const footageNoiseReductionEffectDefinition: EffectDefinition = {
  type: "footage-noise-reduction",
  name: "Footage Noise Reduction",
  keywords: ["noise", "grain", "denoise", "denoising", "clean footage"],
  params: [
    {
      key: "strength",
      label: "Strength",
      type: "number",
      default: 35,
      min: 0,
      max: 100,
      step: 1,
      unit: "percent",
    },
  ],
  renderer: {
    passes: [],
    buildPasses: ({ effectParams }) => {
      const rawStrength = effectParams.strength;
      const strength =
        typeof rawStrength === "number"
          ? Math.min(100, Math.max(0, rawStrength)) / 100
          : 0.35;
      return [
        {
          shader: FOOTAGE_NOISE_REDUCTION_SHADER,
          uniforms: { u_strength: strength },
        },
      ];
    },
  },
};
