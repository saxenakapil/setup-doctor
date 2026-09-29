import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../../src/adapters/frontmatter.js';

describe('parseFrontmatter', () => {
  it('parses plain key: value pairs', () => {
    const result = parseFrontmatter('---\nname: doctor\ndescription: Audits a setup.\n---\nBody text.');
    expect(result.ok).toBe(true);
    expect(result.data.name).toBe('doctor');
    expect(result.data.description).toBe('Audits a setup.');
  });

  it('strips quotes from quoted scalars', () => {
    const result = parseFrontmatter('---\nname: "doctor"\ndescription: \'Audits a setup.\'\n---\n');
    expect(result.data.name).toBe('doctor');
    expect(result.data.description).toBe('Audits a setup.');
  });

  it('reads a folded block scalar (>)', () => {
    const result = parseFrontmatter('---\ndescription: >\n  Audits a setup\n  and reports findings.\n---\n');
    expect(result.data.description).toBe('Audits a setup and reports findings.');
  });

  it('reads a literal block scalar (|)', () => {
    const result = parseFrontmatter('---\ndescription: |\n  Line one.\n  Line two.\n---\n');
    expect(result.data.description).toBe('Line one.\nLine two.');
  });

  it('reports no frontmatter when the file does not start with ---', () => {
    const result = parseFrontmatter('# Just a heading\n');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('no frontmatter');
  });

  it('reports frontmatter not closed', () => {
    const result = parseFrontmatter('---\nname: doctor\n');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('frontmatter not closed');
  });
});
