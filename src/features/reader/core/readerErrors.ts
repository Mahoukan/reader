export function readableError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("password")) {
      return "This PDF is password-protected. Password-protected PDFs are not supported yet.";
    }
  }
  return fallback;
}
