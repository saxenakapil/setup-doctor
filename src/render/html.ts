// Self-contained HTML report. One file, inline CSS/JS, no network. See
// docs/scope.md section 12 and docs/themes.md section 3.

import { embeddedFontFaceCss } from './fonts.js';
import type { Theme } from './themes/index.js';
import type { CategoryScore } from '../core/scoring.js';
import type { Category, Finding, Severity, Skipped } from '../core/types.js';

const CATEGORY_LABELS: Record<Category, string> = {
  instructions: 'Instruction files',
  skills: 'Skills',
  mcp: 'MCP',
  plugins: 'Plugins',
  settings: 'Settings',
  freshness: 'Freshness',
};

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'CRIT',
  high: 'HIGH',
  medium: 'MED',
  low: 'LOW',
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function severityColor(theme: Theme, severity: Severity): string {
  switch (severity) {
    case 'critical':
      return theme.colors.bad;
    case 'high':
      return theme.colors.accent;
    case 'medium':
      return theme.colors.accent2 || theme.colors.warn;
    case 'low':
      return theme.colors.muted;
  }
}

function renderStyles(theme: Theme): string {
  const c = theme.colors;
  return `
    :root { color-scheme: ${theme.name === 'playful' ? 'light' : 'dark'}; }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 32px 16px; background: ${c.bg}; color: ${c.ink};
      font-family: ${theme.fonts.body}; font-size: 16px; line-height: 1.5;
    }
    main { max-width: 760px; margin: 0 auto; }
    h1, h2 { font-family: ${theme.fonts.display}; margin: 0 0 8px; }
    header.report-header {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: 24px; font-family: ${theme.fonts.mono};
    }
    .panel {
      background: ${c.surface}; border: ${theme.border}; border-radius: ${theme.radius.panel}px;
      padding: 24px; margin-bottom: 24px;
      ${theme.hardShadow ? `box-shadow: ${theme.shadow};` : ''}
    }
    .score-numeral { font-family: ${theme.fonts.display}; font-size: 88px; font-weight: 800; margin: 0; }
    .band-pill {
      display: inline-block; padding: 4px 14px; border-radius: ${theme.radius.pill}px;
      background: ${c.accent2}; color: ${theme.name === 'playful' || theme.name === 'mix' ? '#1A1A1A' : c.bg};
      font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;
    }
    .headline { font-size: 18px; margin: 12px 0 4px; }
    .overhead { color: ${c.muted}; font-size: 14px; }
    .category-row { display: flex; align-items: center; gap: 12px; margin: 10px 0; font-size: 14px; }
    .category-name { width: 160px; flex-shrink: 0; }
    .bar-track { flex: 1; height: 10px; background: ${c.track}; border-radius: ${theme.radius.pill}px; overflow: hidden; }
    .bar-fill { display: block; height: 100%; background: ${c.accent}; }
    .category-score { width: 70px; text-align: right; color: ${c.muted}; }
    .finding-card {
      border: ${theme.cardBorder}; border-radius: ${theme.radius.card}px; padding: 14px 16px; margin-bottom: 12px;
      background: ${c.surface};
    }
    .finding-card .sev-tag {
      display: inline-block; font-family: ${theme.fonts.mono}; font-size: 11px; font-weight: 700;
      padding: 2px 8px; border-radius: ${theme.radius.pill}px; margin-right: 8px;
      color: ${theme.name === 'technical' ? c.bg : '#1A1A1A'};
    }
    .finding-card .rule-id { font-family: ${theme.fonts.mono}; color: ${c.link}; margin-right: 8px; }
    .finding-card .message { font-weight: 700; font-size: 16px; }
    .finding-card .fix { color: ${c.muted}; font-size: 14px; margin-top: 6px; }
    details { margin-bottom: 12px; }
    summary { cursor: pointer; font-weight: 700; padding: 8px 0; }
    select { font-family: inherit; font-size: 14px; padding: 4px 8px; margin-bottom: 16px; }
    footer { margin-top: 32px; font-size: 13px; color: ${c.muted}; border-top: ${theme.border}; padding-top: 16px; }
    code { font-family: ${theme.fonts.mono}; }
    .visually-hidden-sev { display: none !important; }
  `;
}

function renderCategoryRows(theme: Theme, categories: CategoryScore[]): string {
  const order: Category[] = ['instructions', 'skills', 'mcp', 'plugins', 'settings', 'freshness'];
  return order
    .map((category) => {
      const c = categories.find((x) => x.category === category);
      if (!c || !c.applicable) return '';
      const displayed = Math.max(0, Math.round(c.fraction * c.weight));
      const pct = c.weight === 0 ? 0 : Math.max(0, Math.min(100, Math.round((displayed / c.weight) * 100)));
      return `
        <div class="category-row">
          <span class="category-name">${escapeHtml(CATEGORY_LABELS[category])}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>
          <span class="category-score">${displayed}/${c.weight}</span>
        </div>`;
    })
    .join('');
}

function renderFindingCard(theme: Theme, f: Finding): string {
  return `
    <div class="finding-card" data-severity="${f.severity}">
      <div>
        <span class="sev-tag" style="background:${severityColor(theme, f.severity)}">${SEVERITY_LABELS[f.severity]}</span>
        <span class="rule-id">${escapeHtml(f.ruleId)}</span>
      </div>
      <div class="message">${escapeHtml(f.message)}</div>
      <div class="fix">Fix: ${escapeHtml(f.fix)}</div>
    </div>`;
}

function renderFindingsSection(theme: Theme, findings: Finding[]): string {
  if (findings.length === 0) {
    return '<p>No findings. Nice work.</p>';
  }
  const top = findings.slice(0, 4);
  const rest = findings.slice(4);
  const topHtml = top.map((f) => renderFindingCard(theme, f)).join('');
  const restHtml = rest.length > 0
    ? `<details><summary>Show all ${findings.length} findings</summary>${rest.map((f) => renderFindingCard(theme, f)).join('')}</details>`
    : '';
  return `
    <label for="severityFilter">Filter by severity: </label>
    <select id="severityFilter">
      <option value="all">All</option>
      <option value="critical">Critical</option>
      <option value="high">High</option>
      <option value="medium">Medium</option>
      <option value="low">Low</option>
    </select>
    <div id="findingsList">${topHtml}${restHtml}</div>`;
}

function renderCollapsedList(title: string, lines: string[]): string {
  if (lines.length === 0) return '';
  const items = lines.map((l) => `<li>${l}</li>`).join('');
  return `<details><summary>${escapeHtml(title)} (${lines.length})</summary><ul>${items}</ul></details>`;
}

export interface HtmlReportInput {
  toolVersion: string;
  rulesVersion: string;
  theme: Theme;
  score: number | null;
  band: string | null;
  capped: boolean;
  categories: CategoryScore[];
  overheadTokens: number;
  findings: Finding[]; // already filtered by --min-severity
  highAndCriticalCount: number; // from the full, unfiltered kept findings
  suppressed: Finding[];
  skipped: Skipped[];
}

export function renderHtmlReport(input: HtmlReportInput): string {
  const { theme } = input;
  const headline =
    input.highAndCriticalCount > 0
      ? `Healthy setup. ${input.highAndCriticalCount} fix${input.highAndCriticalCount === 1 ? '' : 'es'} to look at first.`
      : 'Nice work. No urgent fixes.';
  const headerLabel = theme.name === 'playful' ? 'Setup Doctor' : '$ npx setup-doctor';

  const suppressedLines = input.suppressed.map(
    (f) => `${escapeHtml(f.ruleId)}: ${escapeHtml(f.message)}`,
  );
  const skippedLines = input.skipped.map((s) => `${escapeHtml(s.path)}: ${escapeHtml(s.reason)}`);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none';">
<title>Setup Doctor report</title>
<style>${embeddedFontFaceCss()}${renderStyles(theme)}</style>
</head>
<body>
<main>
  <header class="report-header">
    <span>${escapeHtml(headerLabel)}</span>
    <span>rules v${escapeHtml(input.rulesVersion)}</span>
  </header>

  <section class="panel">
    ${
      input.score === null
        ? '<h1>Not enough to score</h1>'
        : `<p class="score-numeral">${input.score}<span style="font-size:32px;">/100</span></p>
           <span class="band-pill">${escapeHtml(input.band ?? '')}</span>
           ${input.capped ? '<p class="overhead">Score capped at 74: a critical finding was found.</p>' : ''}
           <p class="headline">${escapeHtml(headline)}</p>
           <p class="overhead">Always-loaded context: about ${input.overheadTokens.toLocaleString('en-US')} tokens</p>`
    }
  </section>

  ${
    input.score === null
      ? ''
      : `<section>
          <h2>Where the points went</h2>
          ${renderCategoryRows(theme, input.categories)}
        </section>`
  }

  <section>
    <h2>Fix these first</h2>
    ${renderFindingsSection(theme, input.findings)}
  </section>

  <section>
    ${renderCollapsedList('Suppressed findings', suppressedLines)}
    ${renderCollapsedList('Skipped files', skippedLines)}
  </section>

  <footer>
    <p>Show it off in your README: <code>npx setup-doctor badge</code></p>
    <p>Local reports may contain file paths. Review before sharing this file.</p>
    <p>setup-doctor ${escapeHtml(input.toolVersion)}, local-only, no network access.</p>
  </footer>
</main>
<script>
(function () {
  var select = document.getElementById('severityFilter');
  if (!select) return;
  select.addEventListener('change', function () {
    var value = select.value;
    var cards = document.querySelectorAll('.finding-card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var match = value === 'all' || card.getAttribute('data-severity') === value;
      card.classList.toggle('visually-hidden-sev', !match);
    }
  });
})();
</script>
</body>
</html>
`;
}
