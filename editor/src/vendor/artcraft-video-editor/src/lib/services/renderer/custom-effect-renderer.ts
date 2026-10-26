import {
  FOOTAGE_NOISE_REDUCTION_SHADER,
  SKIN_SMOOTHING_SHADER,
} from "../../effects/custom-shader-ids";
import type { EffectPass } from "../../effects/types";

const vertexShaderSource = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_position * 0.5 + 0.5;
}`;

const skinSmoothingFragmentShader = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_strength;
out vec4 outColor;

float luminance(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

float skinMask(vec3 color) {
  float y = luminance(color);
  float cb = (color.b - y) * 0.564;
  float cr = (color.r - y) * 0.713;
  float blueRange = smoothstep(-0.15, -0.075, cb) *
    (1.0 - smoothstep(0.015, 0.075, cb));
  float redRange = smoothstep(0.025, 0.09, cr) *
    (1.0 - smoothstep(0.24, 0.36, cr));
  float brightnessRange = smoothstep(0.08, 0.24, max(color.r, max(color.g, color.b)));
  return blueRange * redRange * brightnessRange;
}

void main() {
  vec4 center = texture(u_texture, v_uv);
  vec2 texel = 1.0 / max(u_resolution, vec2(1.0));
  vec3 total = center.rgb * 4.0;
  total += texture(u_texture, v_uv + vec2(texel.x, 0.0)).rgb;
  total += texture(u_texture, v_uv - vec2(texel.x, 0.0)).rgb;
  total += texture(u_texture, v_uv + vec2(0.0, texel.y)).rgb;
  total += texture(u_texture, v_uv - vec2(0.0, texel.y)).rgb;
  vec3 softened = total / 8.0;

  float centerLuma = luminance(center.rgb);
  float edgeDelta = 0.0;
  edgeDelta = max(edgeDelta, abs(centerLuma - luminance(texture(u_texture, v_uv + vec2(texel.x, 0.0)).rgb)));
  edgeDelta = max(edgeDelta, abs(centerLuma - luminance(texture(u_texture, v_uv - vec2(texel.x, 0.0)).rgb)));
  edgeDelta = max(edgeDelta, abs(centerLuma - luminance(texture(u_texture, v_uv + vec2(0.0, texel.y)).rgb)));
  edgeDelta = max(edgeDelta, abs(centerLuma - luminance(texture(u_texture, v_uv - vec2(0.0, texel.y)).rgb)));

  float edgeProtection = 1.0 - smoothstep(0.025, 0.14, edgeDelta);
  float amount = clamp(u_strength, 0.0, 1.0) * 0.82 *
    skinMask(center.rgb) * edgeProtection;
  outColor = vec4(mix(center.rgb, softened, amount), center.a);
}`;

const noiseReductionFragmentShader = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_strength;
out vec4 outColor;

float luminance(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec4 center = texture(u_texture, v_uv);
  float strength = clamp(u_strength, 0.0, 1.0);
  if (strength <= 0.001) {
    outColor = center;
    return;
  }

  vec2 texel = 1.0 / max(u_resolution, vec2(1.0));
  float centerLuma = luminance(center.rgb);
  float rangeScale = mix(0.035, 0.22, strength);
  vec3 weightedColor = center.rgb;
  float totalWeight = 1.0;

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      if (x == 0 && y == 0) continue;
      vec2 offset = vec2(float(x), float(y));
      vec3 sampleColor = texture(u_texture, v_uv + offset * texel).rgb;
      float spatialWeight = exp(-dot(offset, offset) * 0.72);
      float difference = abs(luminance(sampleColor) - centerLuma);
      float edgeWeight = exp(-difference / max(rangeScale, 0.001));
      float weight = spatialWeight * edgeWeight;
      weightedColor += sampleColor * weight;
      totalWeight += weight;
    }
  }

  vec3 denoised = weightedColor / totalWeight;
  outColor = vec4(mix(center.rgb, denoised, strength * 0.92), center.a);
}`;

type Processor = {
  canvas: OffscreenCanvas;
  gl: WebGL2RenderingContext;
  programs: Map<string, WebGLProgram>;
  texture: WebGLTexture;
  buffer: WebGLBuffer;
};

let processors: [Processor, Processor] | null = null;
const persistentOutputs = new Map<
  string,
  { canvas: OffscreenCanvas; context: OffscreenCanvasRenderingContext2D }
>();

export function isCustomEffectShader(shader: string): boolean {
  return (
    shader === SKIN_SMOOTHING_SHADER ||
    shader === FOOTAGE_NOISE_REDUCTION_SHADER
  );
}

export function retainCustomEffectOutputs(textureIds: ReadonlySet<string>): void {
  for (const textureId of persistentOutputs.keys()) {
    if (!textureIds.has(textureId)) persistentOutputs.delete(textureId);
  }
}

export function applyCustomEffectPass({
  source,
  width,
  height,
  pass,
}: {
  source: OffscreenCanvas;
  width: number;
  height: number;
  pass: EffectPass;
}): OffscreenCanvas {
  const pool = getProcessors({ width, height });
  const processor =
    pool.find((candidate) => candidate.canvas !== source) ?? pool[0];
  const gl = processor.gl;
  const program = getProgram({ processor, shader: pass.shader });

  gl.viewport(0, 0, width, height);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.SCISSOR_TEST);
  gl.useProgram(program);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, processor.texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    source,
  );

  gl.bindBuffer(gl.ARRAY_BUFFER, processor.buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 0);
  gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), width, height);
  const strengthUniform = pass.uniforms.u_strength;
  const strength = Array.isArray(strengthUniform)
    ? strengthUniform[0] ?? 0
    : strengthUniform ?? 0;
  gl.uniform1f(
    gl.getUniformLocation(program, "u_strength"),
    Math.min(1, Math.max(0, Number(strength))),
  );
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return processor.canvas;
}

export function persistCustomEffectOutput({
  textureId,
  source,
  width,
  height,
}: {
  textureId: string;
  source: OffscreenCanvas;
  width: number;
  height: number;
}): OffscreenCanvas {
  let output = persistentOutputs.get(textureId);
  if (!output || output.canvas.width !== width || output.canvas.height !== height) {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create an effect output canvas.");
    output = { canvas, context };
    persistentOutputs.set(textureId, output);
  }
  output.context.clearRect(0, 0, width, height);
  output.context.drawImage(source, 0, 0, width, height);
  return output.canvas;
}

function getProcessors({
  width,
  height,
}: {
  width: number;
  height: number;
}): [Processor, Processor] {
  if (!processors) {
    processors = [
      createProcessor({ width, height }),
      createProcessor({ width, height }),
    ];
  } else {
    for (const processor of processors) {
      if (processor.canvas.width !== width) processor.canvas.width = width;
      if (processor.canvas.height !== height) processor.canvas.height = height;
    }
  }
  return processors;
}

function createProcessor({
  width,
  height,
}: {
  width: number;
  height: number;
}): Processor {
  const canvas = new OffscreenCanvas(width, height);
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: true,
  });
  if (!gl) {
    throw new Error(
      "Skin and noise effects require WebGL 2. Enable hardware acceleration and try again.",
    );
  }
  const texture = gl.createTexture();
  const buffer = gl.createBuffer();
  if (!texture || !buffer) {
    throw new Error("Could not initialize the video-effects renderer.");
  }
  return { canvas, gl, programs: new Map(), texture, buffer };
}

function getProgram({
  processor,
  shader,
}: {
  processor: Processor;
  shader: string;
}): WebGLProgram {
  const existing = processor.programs.get(shader);
  if (existing) return existing;

  const fragmentSource =
    shader === SKIN_SMOOTHING_SHADER
      ? skinSmoothingFragmentShader
      : shader === FOOTAGE_NOISE_REDUCTION_SHADER
        ? noiseReductionFragmentShader
        : null;
  if (!fragmentSource) throw new Error(`Unsupported video effect: ${shader}`);

  const vertex = compileShader({
    gl: processor.gl,
    type: processor.gl.VERTEX_SHADER,
    source: vertexShaderSource,
  });
  const fragment = compileShader({
    gl: processor.gl,
    type: processor.gl.FRAGMENT_SHADER,
    source: fragmentSource,
  });
  const program = processor.gl.createProgram();
  if (!program) throw new Error("Could not create the video-effects program.");
  processor.gl.attachShader(program, vertex);
  processor.gl.attachShader(program, fragment);
  processor.gl.bindAttribLocation(program, 0, "a_position");
  processor.gl.linkProgram(program);
  if (!processor.gl.getProgramParameter(program, processor.gl.LINK_STATUS)) {
    const message =
      processor.gl.getProgramInfoLog(program) ?? "Unknown program-link error";
    processor.gl.deleteProgram(program);
    throw new Error(`Could not link the video-effects program: ${message}`);
  }
  processor.gl.deleteShader(vertex);
  processor.gl.deleteShader(fragment);
  processor.programs.set(shader, program);
  return program;
}

function compileShader({
  gl,
  type,
  source,
}: {
  gl: WebGL2RenderingContext;
  type: number;
  source: string;
}): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create a video-effect shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(`Could not compile a video-effect shader: ${message}`);
  }
  return shader;
}

