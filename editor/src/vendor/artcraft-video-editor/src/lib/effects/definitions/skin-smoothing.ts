import type { EffectDefinition } from "../types";
import { SKIN_SMOOTHING_SHADER } from "../custom-shader-ids";

export const skinSmoothingEffectDefinition: EffectDefinition = {
  type: "skin-smoothing",
  name: "Skin Smoothing",
  keywords: ["skin", "portrait", "beauty", "smooth", "retouch"],
  params: [
    {
      key: "strength",
      label: "Strength",
      type: "number",
      default: 30,
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
          : 0.3;
      return [
        {
          shader: SKIN_SMOOTHING_SHADER,
          uniforms: { u_strength: strength },
        },
      ];
    },
  },
};
