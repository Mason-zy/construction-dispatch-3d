import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  canEncodeVideo,
} from "mediabunny";

const FPS = 60;
const KEY_FRAME_INTERVAL = FPS * 2;
const FRAMES_PER_UPDATE = 8;

async function chooseFormat(width, height, quality) {
  const options = { width, height, quality, frameRate: FPS };
  if (await canEncodeVideo("avc", options)) {
    return { codec: "avc", format: new Mp4OutputFormat(), extension: "mp4" };
  }
  if (await canEncodeVideo("vp8", options)) {
    return { codec: "vp8", format: new WebMOutputFormat(), extension: "webm" };
  }
  throw new Error("此浏览器无法编码 60 fps 视频。请在支持 WebCodecs 的 Chrome 或 Edge 中打开页面。");
}

export async function exportVideo({
  canvas,
  duration,
  renderFrame,
  onProgress = () => {},
  signal,
}) {
  const { width, height } = canvas;
  const frameCount = Math.round(duration * FPS);
  if (!Number.isSafeInteger(frameCount) || frameCount < 1) {
    throw new RangeError("导出时长必须至少包含一帧。");
  }
  if (width < 2 || height < 2 || width % 2 || height % 2) {
    throw new RangeError("视频画布的宽和高必须是正偶数。");
  }

  signal?.throwIfAborted();
  onProgress(0);
  const quality = new Quality({ bitrate: 3_500_000 });
  const { codec, format, extension } = await chooseFormat(width, height, quality);
  signal?.throwIfAborted();
  const target = new BufferTarget();
  const output = new Output({ format, target });
  const source = new CanvasSource(canvas, {
    codec,
    quality,
    sizeChangeBehavior: "deny",
  });
  output.addVideoTrack(source, { frameRate: FPS });

  try {
    await output.start();
    for (let frame = 0; frame < frameCount; frame++) {
      signal?.throwIfAborted();
      // Drive the scene by frame number so encoding speed cannot affect playback timing.
      const time = frame / FPS;
      await renderFrame(time);
      await source.add(time, 1 / FPS, { keyFrame: frame % KEY_FRAME_INTERVAL === 0 });
      if ((frame + 1) % FRAMES_PER_UPDATE === 0) {
        onProgress(Math.min(0.99, (frame + 1) / frameCount));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    signal?.throwIfAborted();
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  }

  signal?.throwIfAborted();
  if (!target.buffer?.byteLength) throw new Error("视频编码完成，但没有生成文件。");
  const blob = new Blob([target.buffer], { type: "video/" + extension });
  onProgress(1);
  return { blob, extension, frameCount, fps: FPS };
}
