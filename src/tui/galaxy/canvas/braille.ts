// dot bit for (sub x, sub y) inside a U+2800 cell
export const BIT = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];
export const brailleChar = (mask: number) => String.fromCharCode(0x2800 + mask);
