/**
 * FFmpeg Command Builder
 * Generates FFmpeg command strings for various playout modes.
 * These are templates — adapt them for your specific environment.
 */

export interface DestinationConfig {
  streamUrl: string;
  streamKey: string;
  platform: string;
}

export interface FilePlayoutOptions {
  inputFile: string;
  destinations: DestinationConfig[];
  loop?: boolean;
  audioVolume?: number;
}

export interface PlaylistPlayoutOptions {
  playlistFile: string;
  destinations: DestinationConfig[];
  loop?: boolean;
}

export interface RtmpIngestOptions {
  ingestPort?: number;
  streamKey: string;
  destinations: DestinationConfig[];
}

export interface SrtIngestOptions {
  srtPort: number;
  streamKey: string;
  destinations: DestinationConfig[];
}

export interface FallbackSlateOptions {
  slateFile: string;
  destinations: DestinationConfig[];
}

function buildOutputArgs(destinations: DestinationConfig[]): string[] {
  return destinations.flatMap((dest) => {
    if (dest.platform === "srt") {
      const srtUrl = dest.streamUrl.includes("?")
        ? dest.streamUrl
        : `${dest.streamUrl}`;
      return [
        "-c:v", "copy",
        "-c:a", "copy",
        "-f", "mpegts",
        srtUrl,
      ];
    }
    const rtmpUrl = `${dest.streamUrl}/${dest.streamKey}`.replace(/\/+$/, "");
    return [
      "-c:v", "copy",
      "-c:a", "copy",
      "-f", "flv",
      rtmpUrl,
    ];
  });
}

/**
 * Loop a single file indefinitely to one or more RTMP destinations.
 *
 * Example:
 *   ffmpeg -re -stream_loop -1 -i /media/slate.mp4 \
 *     -c:v copy -c:a copy -f flv rtmp://a.rtmp.youtube.com/live2/xxxx
 */
export function buildFileLoopCommand(opts: FilePlayoutOptions): string[] {
  const loop = opts.loop !== false;
  const cmd = [
    "ffmpeg",
    "-hide_banner",
    "-loglevel", "info",
    "-stats",
    "-re",
    ...(loop ? ["-stream_loop", "-1"] : []),
    "-i", opts.inputFile,
  ];

  if (opts.audioVolume != null) {
    cmd.push("-af", `volume=${opts.audioVolume}`);
  }

  cmd.push(...buildOutputArgs(opts.destinations));

  return cmd;
}

/**
 * Play a concat playlist file continuously.
 * The playlist file is an FFmpeg concat demuxer file:
 *
 *   file '/media/assets/clip1.mp4'
 *   file '/media/assets/clip2.mp4'
 *
 * Example:
 *   ffmpeg -re -f concat -safe 0 -stream_loop -1 -i /tmp/playlist.txt \
 *     -c:v copy -c:a copy -f flv rtmp://...
 */
export function buildPlaylistCommand(opts: PlaylistPlayoutOptions & { protocolWhitelist?: boolean }): string[] {
  const loop = opts.loop !== false;
  const cmd = [
    "ffmpeg",
    "-hide_banner",
    "-loglevel", "info",
    "-stats",
    "-re",
  ];

  if (opts.protocolWhitelist) {
    cmd.push("-protocol_whitelist", "file,http,https,tcp,tls,crypto");
  }

  cmd.push(
    "-f", "concat",
    "-safe", "0",
    ...(loop ? ["-stream_loop", "-1"] : []),
    "-i", opts.playlistFile,
    "-c:v", "copy",
    "-c:a", "copy",
  );

  cmd.push(...buildOutputArgs(opts.destinations));

  return cmd;
}

/**
 * Receive RTMP ingest and restream to multiple destinations.
 *
 * Example (using SRS as ingest, pulling from it):
 *   ffmpeg -re -i rtmp://localhost/live/{streamKey} \
 *     -c:v copy -c:a copy -f flv rtmp://destination1/live/key1 \
 *     -c:v copy -c:a copy -f flv rtmp://destination2/live/key2
 */
export function buildRtmpIngestCommand(opts: RtmpIngestOptions): string[] {
  const port = opts.ingestPort ?? 1935;
  const ingestUrl = `rtmp://localhost:${port}/live/${opts.streamKey}`;

  const cmd = [
    "ffmpeg",
    "-hide_banner",
    "-loglevel", "warning",
    "-re",
    "-i", ingestUrl,
    "-c:v", "copy",
    "-c:a", "copy",
  ];

  cmd.push(...buildOutputArgs(opts.destinations));

  return cmd;
}

/**
 * Receive SRT ingest and restream to multiple RTMP destinations.
 *
 * Example:
 *   ffmpeg -re -i "srt://0.0.0.0:9000?mode=listener&streamid={streamKey}" \
 *     -c:v copy -c:a copy -f flv rtmp://destination/live/key
 */
export function buildSrtIngestCommand(opts: SrtIngestOptions): string[] {
  const srtUrl = `srt://0.0.0.0:${opts.srtPort}?mode=listener&streamid=${opts.streamKey}`;

  const cmd = [
    "ffmpeg",
    "-hide_banner",
    "-loglevel", "warning",
    "-re",
    "-i", srtUrl,
    "-c:v", "copy",
    "-c:a", "copy",
  ];

  cmd.push(...buildOutputArgs(opts.destinations));

  return cmd;
}

/**
 * Fallback slate: loop a static image or video when no active source.
 *
 * Example (static image slate):
 *   ffmpeg -loop 1 -re -i /media/slate.jpg \
 *     -lavfi aevalsrc=0 \
 *     -c:v libx264 -preset ultrafast -tune stillimage -b:v 500k \
 *     -c:a aac -ar 44100 \
 *     -f flv rtmp://...
 */
export function buildFallbackSlateCommand(opts: FallbackSlateOptions): string[] {
  const isImage = /\.(jpg|jpeg|png|bmp)$/i.test(opts.slateFile);

  if (isImage) {
    const cmd = [
      "ffmpeg",
      "-hide_banner",
      "-loglevel", "warning",
      "-loop", "1",
      "-re",
      "-i", opts.slateFile,
      "-f", "lavfi",
      "-i", "aevalsrc=0",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-tune", "stillimage",
      "-b:v", "500k",
      "-c:a", "aac",
      "-ar", "44100",
    ];
    cmd.push(...buildOutputArgs(opts.destinations));
    return cmd;
  }

  return buildFileLoopCommand({ inputFile: opts.slateFile, destinations: opts.destinations, loop: true });
}

/**
 * Generate an FFmpeg concat playlist file content from a list of file paths.
 */
export function generateConcatPlaylistContent(filePaths: string[]): string {
  return filePaths.map((p) => `file '${p}'`).join("\n") + "\n";
}
