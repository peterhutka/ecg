function signExtend12(value: number) {
  return value & 0x800 ? value - 0x1000 : value;
}

export function decodeFormat212(rawBytes: Uint8Array) {
  if (rawBytes.length % 3 !== 0) {
    return null;
  }

  const samples: number[] = [];
  for (let index = 0; index < rawBytes.length; index += 3) {
    const first = rawBytes[index];
    const second = rawBytes[index + 1];
    const third = rawBytes[index + 2];

    const sampleOne = signExtend12(first | ((second & 0x0f) << 8));
    const sampleTwo = signExtend12((second >> 4) | (third << 4));
    samples.push(sampleOne, sampleTwo);
  }

  return samples;
}
