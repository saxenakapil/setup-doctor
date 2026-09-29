// Token estimate helper. See docs/scope.md section 4: Math.ceil(characters / 4).

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
