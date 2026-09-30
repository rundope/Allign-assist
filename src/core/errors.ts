// Errors whose message is a translatable key (the Korean source text) plus arguments,
// so code that runs in the worker never needs to know the UI language.
export class CodedError extends Error {
  constructor(
    public key: string,
    public args: (string | number)[] = [],
  ) {
    super(key.replace(/\{(\d+)\}/g, (m, i) => (args[Number(i)] !== undefined ? String(args[Number(i)]) : m)));
  }
}
