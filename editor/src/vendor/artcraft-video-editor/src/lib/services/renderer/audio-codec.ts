import type { ExportFormat } from "../../export";

type AudioEncoderProbe = {
  isConfigSupported: (config: {
    codec: string;
    sampleRate: number;
    numberOfChannels: number;
    bitrate: number;
  }) => Promise<{ supported?: boolean }>;
};

export async function resolveAudioCodec({
  format,
  audioBuffer,
  audioEncoder,
}: {
  format: ExportFormat;
  audioBuffer: Pick<AudioBuffer, "sampleRate" | "numberOfChannels">;
  audioEncoder?: AudioEncoderProbe;
}): Promise<"aac" | "opus"> {
  if (format === "webm") return "opus";

  if (!audioEncoder) {
    throw new Error(
      "MP4 audio export is unavailable because AAC encoding is not supported. Choose WebM or turn off audio.",
    );
  }

  let supported: boolean | undefined;
  try {
    ({ supported } = await audioEncoder.isConfigSupported({
      codec: "mp4a.40.2",
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
      bitrate: 192000,
    }));
  } catch {
    throw new Error(
      "MP4 audio export could not verify AAC support. Choose WebM or turn off audio.",
    );
  }

  if (!supported) {
    throw new Error(
      "MP4 audio export is unavailable because AAC encoding is not supported. Choose WebM or turn off audio.",
    );
  }

  return "aac";
}
