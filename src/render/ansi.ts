// Hand-written ANSI color helper. See docs/scope.md section 4 ("Terminal
// color: Hand-written ANSI helper; respect NO_COLOR and non-TTY").
//
// Callers decide once, up front, whether color is on (see shouldUseColor),
// then pass that decision down. Nothing in here reads the environment or a
// stream itself, so render functions stay pure and testable.

const CODES = {
  reset: 0,
  bold: 1,
  dim: 2,
  red: 31,
  green: 32,
  yellow: 33,
  cyan: 36,
  gray: 90,
} as const;

type ColorName = keyof typeof CODES;

export type Colorize = (text: string) => string;

export interface Ansi {
  bold: Colorize;
  dim: Colorize;
  red: Colorize;
  green: Colorize;
  yellow: Colorize;
  cyan: Colorize;
  gray: Colorize;
  boldRed: Colorize;
}

function wrap(code: number, text: string): string {
  return `\u001b[${code}m${text}\u001b[${CODES.reset}m`;
}

function wrapTwo(codeA: number, codeB: number, text: string): string {
  return `\u001b[${codeA};${codeB}m${text}\u001b[${CODES.reset}m`;
}

const identity: Colorize = (text) => text;

const PLAIN: Ansi = {
  bold: identity,
  dim: identity,
  red: identity,
  green: identity,
  yellow: identity,
  cyan: identity,
  gray: identity,
  boldRed: identity,
};

function makeColored(): Ansi {
  const named = (name: Exclude<ColorName, 'reset'>): Colorize => (text) => wrap(CODES[name], text);
  return {
    bold: named('bold'),
    dim: named('dim'),
    red: named('red'),
    green: named('green'),
    yellow: named('yellow'),
    cyan: named('cyan'),
    gray: named('gray'),
    boldRed: (text) => wrapTwo(CODES.bold, CODES.red, text),
  };
}

const COLORED: Ansi = makeColored();

/** Returns the color function set to use: real ANSI codes, or no-op passthrough. */
export function getAnsi(useColor: boolean): Ansi {
  return useColor ? COLORED : PLAIN;
}

export interface ColorDecisionInput {
  noColorFlag: boolean;
  ciFlag: boolean;
  env: Record<string, string | undefined>;
  isTTY: boolean;
}

/**
 * Decides whether to emit color, per scope.md: NO_COLOR and non-TTY are
 * respected, and --ci implies no color (it asks for stable, diffable output).
 * --no-color always wins when set; nothing here can turn color back on.
 */
export function shouldUseColor(input: ColorDecisionInput): boolean {
  if (input.noColorFlag) return false;
  if (input.ciFlag) return false;
  if (input.env.NO_COLOR !== undefined && input.env.NO_COLOR !== '') return false;
  if (input.env.FORCE_COLOR !== undefined && input.env.FORCE_COLOR !== '0') return true;
  return input.isTTY;
}
