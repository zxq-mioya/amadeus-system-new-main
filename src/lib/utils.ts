import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function minFramesForTargetMS(
  targetDuration: number,
  frameSamples: number,
  sr = 16000
): number {
  return Math.ceil((targetDuration * sr) / 1000 / frameSamples)
}

export function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  const binary = new Array(len)
  for (let i = 0; i < len; i++) {
    binary[i] = String.fromCharCode(bytes[i])
  }
  return btoa(binary.join(''))
}


export function encodeCompressedWAV(
  samples: Float32Array,
  sampleRate: number = 16000,
  targetSampleRate: number = 6000,
  bitDepth: number = 8
) {
  const downsampledData = downsample(samples, sampleRate, targetSampleRate);
  const numChannels = 1; // 使用单声道
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + downsampledData.length * bytesPerSample);
  const view = new DataView(buffer);

  // 写入WAV文件头
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + downsampledData.length * bytesPerSample, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM格式
  view.setUint16(22, numChannels, true);
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, downsampledData.length * bytesPerSample, true);

  // 写入音频数据
  if (bitDepth === 8) {
    floatTo8BitPCM(view, 44, downsampledData);
  } else if (bitDepth === 16) {
    floatTo16BitPCM(view, 44, downsampledData);
  } else {
    writeFloat32(view, 44, downsampledData);
  }

  return buffer;
}

function downsample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  const rate = fromRate / toRate;
  const newLength = Math.round(samples.length / rate);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    result[i] = samples[Math.floor(i * rate)];
  }
  return result;
}

function writeFloat32(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 4) {
    output.setFloat32(offset, input[i] as number, true)
  }
}

function floatTo16BitPCM(
  output: DataView,
  offset: number,
  input: Float32Array
) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i] as number))
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

export async function audioFileToArray(audioFileData: Blob) {
  const ctx = new OfflineAudioContext(1, 1, 44100)
  const reader = new FileReader()
  let audioBuffer: AudioBuffer | null = null
  await new Promise<void>((res) => {
    reader.addEventListener("loadend", (ev) => {
      const audioData = reader.result as ArrayBuffer
      ctx.decodeAudioData(
        audioData,
        (buffer) => {
          audioBuffer = buffer
          ctx
            .startRendering()
            .then(() => {
              console.log("Rendering completed successfully")
              res()
            })
            .catch((err) => {
              console.error(`Rendering failed: ${err}`)
            })
        },
        (e) => {
          console.error(`Error with decoding audio data: ${e}`)
        }
      )
    })
    reader.readAsArrayBuffer(audioFileData)
  })
  if (audioBuffer === null) {
    throw Error("some shit")
  }
  const _audioBuffer = audioBuffer as AudioBuffer
  const out = new Float32Array(_audioBuffer.length)
  for (let i = 0; i < _audioBuffer.length; i++) {
    for (let j = 0; j < _audioBuffer.numberOfChannels; j++) {
      // @ts-ignore
      out[i] += _audioBuffer.getChannelData(j)[i]
    }
  }
  return { audio: out, sampleRate: _audioBuffer.sampleRate }
}

function floatTo8BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setUint8(offset, (s * 0.5 + 0.5) * 255);
  }
}
