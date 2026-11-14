/** Server "now". Honours FAKE_NOW (ISO string) outside production so the whole flow can be tested. */
export function getNow(): Date {
  const fake = process.env.FAKE_NOW;
  if (fake && process.env.NODE_ENV !== 'production') {
    const d = new Date(fake);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}
