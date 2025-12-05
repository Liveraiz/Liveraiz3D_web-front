// nrrdEncoder.js
// import { parse } from "https://cdn.jsdelivr.net/npm/nrrd-js@0.2.0/dist/nrrd-js.esm.js";

export function voxelToNRRD(data, dims, spacing) {
    const header = `NRRD0005
type: uint8
dimension: 3
sizes: ${dims.join(' ')}
spacings: ${spacing.join(' ')}
encoding: raw
endian: little
\n`;

    const encoder = new TextEncoder();
    const headerBuffer = encoder.encode(header);
    const combinedBuffer = new Uint8Array(headerBuffer.length + data.length);
    combinedBuffer.set(headerBuffer, 0);
    combinedBuffer.set(data, headerBuffer.length);

    return combinedBuffer.buffer;
}