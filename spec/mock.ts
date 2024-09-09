export class MockHttpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HttpError";
  }
}