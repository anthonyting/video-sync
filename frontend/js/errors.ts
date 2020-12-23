export class BufferError extends Error {
  public readonly id: number;
  public readonly bufferTime: number;
  constructor(message: string, id: number, bufferTime: number) {
    super(message);
    this.id = id;
    this.bufferTime = bufferTime;
  }
}
