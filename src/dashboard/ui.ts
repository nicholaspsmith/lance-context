/**
 * Lance logo as base64 PNG (40x36)
 */
const LOGO_PNG = `data:image/png;base64,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`;

/**
 * Favicon as base64 PNG data URL (32x29)
 */
const FAVICON_PNG = `data:image/png;base64,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`;

/**
 * Generate the dashboard HTML page.
 * This is a self-contained HTML page with embedded CSS and JavaScript.
 */
export function getDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>lance-context Dashboard</title>
  <link rel="icon" type="image/png" href="${FAVICON_PNG}">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/charts.css/dist/charts.min.css">
  <style>
    :root {
      /* Light theme */
      --bg-primary-light: #ffffff;
      --bg-secondary-light: #f6f8fa;
      --bg-tertiary-light: #eaeef2;
      --border-color-light: #d0d7de;
      --text-primary-light: #1f2328;
      --text-secondary-light: #656d76;
      --text-muted-light: #8c959f;
      --accent-blue: #0969da;
      --accent-green: #1a7f37;
      --accent-yellow: #9a6700;
      --accent-red: #cf222e;
      --accent-purple: #8250df;

      /* Dark theme */
      --bg-primary-dark: #0d1117;
      --bg-secondary-dark: #161b22;
      --bg-tertiary-dark: #21262d;
      --border-color-dark: #30363d;
      --text-primary-dark: #e6edf3;
      --text-secondary-dark: #8b949e;
      --text-muted-dark: #6e7681;
      --accent-blue-dark: #58a6ff;
      --accent-green-dark: #3fb950;
      --accent-yellow-dark: #d29922;
      --accent-red-dark: #f85149;
      --accent-purple-dark: #a371f7;
    }

    [data-theme="dark"] {
      --bg-primary: var(--bg-primary-dark);
      --bg-secondary: var(--bg-secondary-dark);
      --bg-tertiary: var(--bg-tertiary-dark);
      --border-color: var(--border-color-dark);
      --text-primary: var(--text-primary-dark);
      --text-secondary: var(--text-secondary-dark);
      --text-muted: var(--text-muted-dark);
      --accent-blue: var(--accent-blue-dark);
      --accent-green: var(--accent-green-dark);
      --accent-yellow: var(--accent-yellow-dark);
      --accent-red: var(--accent-red-dark);
      --accent-purple: var(--accent-purple-dark);
    }

    [data-theme="light"] {
      --bg-primary: var(--bg-primary-light);
      --bg-secondary: var(--bg-secondary-light);
      --bg-tertiary: var(--bg-tertiary-light);
      --border-color: var(--border-color-light);
      --text-primary: var(--text-primary-light);
      --text-secondary: var(--text-secondary-light);
      --text-muted: var(--text-muted-light);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
      background-color: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.5;
      min-height: 100vh;
      transition: background-color 0.3s ease, color 0.3s ease;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .header-left {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }

    .header-left h1 {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .project-name {
      font-size: 14px;
      color: var(--text-secondary);
      font-weight: 500;
      padding-left: 52px; /* Align with text after logo */
    }

    .project-name:empty {
      display: none;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    h1 {
      font-size: 24px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .logo img {
      width: 40px;
      height: auto;
    }

    .version-badge {
      font-size: 12px;
      font-weight: 400;
      color: var(--text-muted);
      margin-left: 4px;
    }

    .theme-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background-color: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      cursor: pointer;
      color: var(--text-secondary);
      font-size: 14px;
      transition: all 0.2s ease;
    }

    .theme-toggle:hover {
      background-color: var(--bg-secondary);
      color: var(--text-primary);
    }

    .theme-toggle svg {
      width: 16px;
      height: 16px;
    }

    .sun-icon, .moon-icon {
      display: none;
    }

    [data-theme="dark"] .moon-icon {
      display: block;
    }

    [data-theme="light"] .sun-icon {
      display: block;
    }

    .connection-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: var(--text-secondary);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--accent-red);
    }

    .status-dot.connected {
      background-color: var(--accent-green);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }

    /* Tablet: 2 cards per row */
    @media (max-width: 1024px) {
      .grid {
        grid-template-columns: repeat(2, 1fr);
      }
      .card.double-width {
        grid-column: span 2;
      }
    }

    /* Mobile: 1 card per row */
    @media (max-width: 768px) {
      .grid {
        grid-template-columns: 1fr;
      }
      .card.double-width {
        grid-column: span 1;
      }
    }

    .card {
      background-color: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 20px;
      transition: background-color 0.3s ease, border-color 0.3s ease;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .card-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: 500;
      border-radius: 12px;
      background-color: var(--bg-tertiary);
      color: var(--text-secondary);
    }

    .badge.success {
      background-color: rgba(63, 185, 80, 0.15);
      color: var(--accent-green);
    }

    .badge.warning {
      background-color: rgba(210, 153, 34, 0.15);
      color: var(--accent-yellow);
    }

    .badge.error {
      background-color: rgba(248, 81, 73, 0.15);
      color: var(--accent-red);
    }

    /* Warning banner */
    .warning-banner {
      display: none;
      background-color: rgba(210, 153, 34, 0.15);
      border: 1px solid var(--accent-yellow);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }

    .warning-banner.visible {
      display: block;
    }

    .warning-banner-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      color: var(--accent-yellow);
      margin-bottom: 8px;
    }

    .warning-banner-header svg {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    .warning-banner-content {
      font-size: 14px;
      color: var(--text-secondary);
      line-height: 1.6;
    }

    .warning-banner-content strong {
      color: var(--text-primary);
    }

    .warning-banner-content code {
      background-color: var(--bg-tertiary);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 13px;
    }

    .warning-banner-actions {
      margin-top: 12px;
      font-size: 13px;
      color: var(--text-muted);
    }

    /* Form styles */
    .settings-form {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
    }

    .form-group {
      margin-bottom: 12px;
    }

    .form-group label {
      display: block;
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 6px;
    }

    .form-select,
    .form-input {
      width: 100%;
      padding: 8px 12px;
      font-size: 14px;
      font-family: inherit;
      background-color: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-primary);
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    .form-select:focus,
    .form-input:focus {
      outline: none;
      border-color: var(--accent-blue);
      box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.2);
    }

    .form-hint {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .form-hint a {
      color: var(--accent-blue);
      text-decoration: none;
    }

    .form-hint a:hover {
      text-decoration: underline;
    }

    .form-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 16px;
    }

    .btn {
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 500;
      border-radius: 6px;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-primary {
      background-color: var(--accent-blue);
      color: white;
    }

    .btn-primary:hover {
      opacity: 0.9;
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      background-color: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border-primary);
    }

    .btn-secondary:hover {
      background-color: var(--bg-secondary);
      border-color: var(--accent-blue);
    }

    .btn-secondary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-danger {
      color: var(--accent-red);
    }

    .btn-danger:hover {
      background-color: rgba(239, 68, 68, 0.1);
      border-color: var(--accent-red);
    }

    .reindex-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border-primary);
    }

    .save-status {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .save-status.success {
      color: var(--accent-green);
    }

    .save-status.error {
      color: var(--accent-red);
    }

    .stat {
      margin-bottom: 12px;
    }

    .stat:last-child {
      margin-bottom: 0;
    }

    .stat-label {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 4px;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .stat-value.small {
      font-size: 14px;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      color: var(--text-secondary);
    }

    .progress-container {
      margin-top: 16px;
      display: none;
    }

    .progress-container.active {
      display: block;
    }

    .progress-bar {
      height: 8px;
      background-color: var(--bg-tertiary);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent-blue), var(--accent-purple));
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .progress-text {
      font-size: 12px;
      color: var(--text-secondary);
      white-space: pre-line;
    }

    .patterns-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .pattern-tag {
      display: inline-block;
      padding: 2px 8px;
      font-size: 12px;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      background-color: var(--bg-tertiary);
      border-radius: 4px;
      color: var(--text-secondary);
    }

    .pattern-tag.exclude {
      color: var(--accent-red);
      text-decoration: line-through;
      opacity: 0.7;
    }

    .card.full-width {
      grid-column: 1 / -1;
    }

    .card.double-width {
      grid-column: span 2;
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-secondary);
    }

    .empty-state-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .pulsing {
      animation: pulse 2s ease-in-out infinite;
    }

    /* Charts.css Customization - use aspect-ratio per docs */
    #chartWrapper {
      width: 100%;
      max-width: 100%;
    }

    #chartWrapper .column {
      --aspect-ratio: 16 / 4;
    }

    #usage-chart td {
      border-top-left-radius: 6px;
      border-top-right-radius: 6px;
    }

    /* Charts.css legend overrides */
    #usageChartContainer .legend {
      margin-top: 16px;
      padding-top: 12px;
      justify-content: center;
      border-radius: 4px;
    }

    #usageChartContainer .legend li {
      font-size: 12px;
      color: var(--text-secondary);
      cursor: pointer;
      transition: opacity 0.15s ease;
    }

    /* Apply --color variable to legend squares - override charts.css defaults */
    #chartLegend.legend.legend-square li::before {
      background: var(--color) !important;
      border-color: var(--color) !important;
    }

    #usageChartContainer .legend li:hover {
      opacity: 1;
    }

    #usage-chart tr {
      transition: opacity 0.15s ease;
    }

    #usage-chart.legend-hover tr {
      opacity: 0.3;
    }

    #usage-chart.legend-hover tr.highlight {
      opacity: 1;
    }

    /* Bar hover highlighting for legend */
    #chartLegend.bar-hover li {
      opacity: 0.3;
      transition: opacity 0.15s ease;
    }

    #chartLegend.bar-hover li.highlight {
      opacity: 1;
    }

    .usage-total {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 12px;
      border-top: 1px solid var(--border-color);
      margin-top: 16px;
    }

    .usage-total-label {
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .usage-total-count {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .usage-empty {
      text-align: center;
      padding: 20px;
      color: var(--text-muted);
      font-size: 14px;
    }

    /* Server Log Panel Styles */
    .log-section {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid var(--border-color);
    }

    .log-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      cursor: pointer;
      user-select: none;
    }

    .log-header:hover .log-title {
      color: var(--accent-blue);
    }

    .log-toggle {
      transition: transform 0.2s;
      transform: rotate(90deg);
    }

    .log-toggle.collapsed {
      transform: rotate(0deg);
    }

    .log-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      transition: color 0.2s;
    }

    .log-container {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-primary);
      border-radius: 8px;
      max-height: 300px;
      overflow-y: auto;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      font-size: 12px;
    }

    .log-container.collapsed {
      display: none;
    }

    .log-entry {
      padding: 4px 12px;
      border-bottom: 1px solid var(--border-primary);
      display: flex;
      gap: 8px;
    }

    .log-entry:last-child {
      border-bottom: none;
    }

    .log-time {
      color: var(--text-muted);
      flex-shrink: 0;
    }

    .log-message {
      color: var(--text-primary);
      word-break: break-word;
    }

    .log-entry.log-error .log-message {
      color: var(--accent-red);
    }

    .log-entry.log-warn .log-message {
      color: var(--accent-yellow);
    }

    .log-empty {
      padding: 20px;
      text-align: center;
      color: var(--text-muted);
    }

    .log-actions {
      display: flex;
      gap: 8px;
      margin-left: auto;
    }

    .log-actions button {
      padding: 2px 8px;
      font-size: 11px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      color: var(--text-secondary);
      cursor: pointer;
    }

    .log-actions button:hover {
      background: var(--bg-tertiary);
      color: var(--text-primary);
    }

    /* Beads Section Styles */
    .beads-section {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid var(--border-color);
    }

    .beads-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .beads-logo {
      width: 24px;
      height: 24px;
    }

    .beads-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .beads-unavailable {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-muted);
      font-size: 14px;
    }

    .beads-stats {
      display: flex;
      gap: 24px;
      margin-bottom: 16px;
    }

    .beads-stat {
      display: flex;
      flex-direction: column;
    }

    .beads-stat-value {
      font-size: 24px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .beads-stat-label {
      font-size: 12px;
      color: var(--text-muted);
    }

    .beads-issues {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .beads-issue {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px;
      background-color: var(--bg-tertiary);
      border-radius: 6px;
      border: 1px solid var(--border-color);
    }

    .beads-issue-id {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 12px;
      color: var(--accent-blue);
      white-space: nowrap;
    }

    .beads-issue-content {
      flex: 1;
      min-width: 0;
    }

    .beads-issue-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .beads-issue-meta {
      display: flex;
      gap: 12px;
      font-size: 12px;
      color: var(--text-muted);
    }

    .beads-issue-type {
      display: inline-flex;
      padding: 2px 6px;
      background-color: var(--bg-secondary);
      border-radius: 4px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .beads-issue-priority {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .priority-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .priority-1 { background-color: var(--accent-red); }
    .priority-2 { background-color: var(--accent-yellow); }
    .priority-3 { background-color: var(--accent-green); }

    .beads-daemon-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 12px;
    }

    .beads-empty {
      text-align: center;
      padding: 20px;
      color: var(--text-muted);
      font-size: 14px;
    }

    .beads-issue {
      cursor: pointer;
      transition: background-color 0.2s ease;
    }

    .beads-issue:hover {
      background-color: var(--bg-secondary);
    }

    .beads-issue-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .beads-issue-expand {
      width: 16px;
      height: 16px;
      color: var(--text-muted);
      transition: transform 0.2s ease;
      flex-shrink: 0;
    }

    .beads-issue.expanded .beads-issue-expand {
      transform: rotate(90deg);
    }

    .beads-issue-description {
      display: none;
      margin-top: 8px;
      padding: 12px;
      background-color: var(--bg-secondary);
      border-radius: 4px;
      font-size: 13px;
      color: var(--text-secondary);
      white-space: pre-wrap;
      word-break: break-word;
      border-left: 3px solid var(--accent-blue);
    }

    .beads-issue.expanded .beads-issue-description {
      display: block;
    }

    .beads-issue-no-description {
      font-style: italic;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-left">
        <h1>
          <div class="logo"><img src="${LOGO_PNG}" alt="lance-context logo" width="40" height="36"></div>
          lance-context
          <span class="version-badge" id="versionBadge"></span>
        </h1>
        <div class="project-name" id="projectName"></div>
      </div>
      <div class="header-right">
        <button class="theme-toggle" id="themeToggle" title="Toggle theme">
          <svg class="sun-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <svg class="moon-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
          <span class="theme-label">Theme</span>
        </button>
        <div class="connection-status">
          <div class="status-dot" id="connectionDot"></div>
          <span id="connectionText">Connecting...</span>
        </div>
      </div>
    </header>

    <!-- Backend Fallback Warning Banner -->
    <div class="warning-banner" id="fallbackBanner">
      <div class="warning-banner-header">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>Using Ollama (fallback)</span>
      </div>
      <div class="warning-banner-content" id="fallbackContent">
        <!-- Content populated by JavaScript -->
      </div>
      <div class="warning-banner-actions">
        <strong>To resolve:</strong> Wait for rate limits to reset, check your API key, or update <code>.lance-context.json</code> to use <code>"backend": "ollama"</code> permanently.
      </div>
    </div>

    <div class="grid">
      <!-- Index Status Card -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Index Status</span>
          <span class="badge" id="indexBadge">Loading...</span>
        </div>
        <div class="stat">
          <div class="stat-label">Files Indexed</div>
          <div class="stat-value" id="fileCount">-</div>
        </div>
        <div class="stat">
          <div class="stat-label">Total Chunks</div>
          <div class="stat-value" id="chunkCount">-</div>
        </div>
        <div class="stat">
          <div class="stat-label">Last Updated</div>
          <div class="stat-value small" id="lastUpdated">-</div>
        </div>
        <div class="progress-container" id="progressContainer">
          <div class="progress-bar">
            <div class="progress-fill" id="progressFill" style="width: 0%"></div>
          </div>
          <div class="progress-text" id="progressText">Initializing...</div>
        </div>
        <div class="reindex-actions">
          <button type="button" id="reindexBtn" class="btn btn-secondary">Reindex</button>
          <button type="button" id="forceReindexBtn" class="btn btn-secondary btn-danger">Force Reindex</button>
          <span id="reindexStatus" class="save-status"></span>
        </div>
      </div>

      <!-- Embedding Backend Card -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Embedding Backend</span>
          <span class="badge" id="embeddingStatus">-</span>
        </div>
        <div class="stat">
          <div class="stat-label">Current Backend</div>
          <div class="stat-value small" id="embeddingBackend">-</div>
        </div>
        <div class="stat">
          <div class="stat-label">Index Path</div>
          <div class="stat-value small" id="indexPath">-</div>
        </div>
        <div class="settings-form" id="embeddingSettingsForm">
          <div class="form-group">
            <label for="backendSelect">Select Backend</label>
            <select id="backendSelect" class="form-select">
              <option value="ollama">Ollama (local)</option>
              <option value="gemini" selected>Google Gemini (free - requires API key)</option>
            </select>
          </div>
          <div class="form-group" id="ollamaSettingsGroup">
            <label for="concurrencySelect">Ollama Concurrency</label>
            <select id="concurrencySelect" class="form-select">
              <option value="1" selected>1 (default)</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="250">250</option>
              <option value="500">500</option>
              <option value="1000">1000</option>
            </select>
          </div>
          <div class="form-group" id="batchSizeGroup">
            <label for="batchSizeSelect">Batch Size</label>
            <select id="batchSizeSelect" class="form-select">
              <option value="32">32</option>
              <option value="64">64</option>
              <option value="128">128</option>
              <option value="256" selected>256 (default)</option>
              <option value="512">512</option>
              <option value="1024">1024</option>
              <option value="2048">2048</option>
              <option value="4096">4096</option>
              <option value="8192">8192</option>
              <option value="16384">16384</option>
            </select>
          </div>
          <div class="form-group" id="apiKeyGroup" style="display: none;">
            <label for="apiKeyInput" id="apiKeyLabel">API Key</label>
            <input type="password" id="apiKeyInput" class="form-input" placeholder="" />
            <div class="form-hint" id="apiKeyHint"></div>
          </div>
          <div class="form-actions">
            <button type="button" id="saveEmbeddingBtn" class="btn btn-primary">Save Settings</button>
            <span id="saveStatus" class="save-status"></span>
          </div>
        </div>
      </div>

      <!-- Dashboard Settings Card -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Dashboard Settings</span>
          <span class="badge" id="dashboardBadge">Enabled</span>
        </div>
        <div class="stat">
          <div class="stat-label">Auto-Start on MCP Launch</div>
          <div class="stat-value small" id="dashboardEnabled">-</div>
        </div>
        <div class="settings-form" id="dashboardSettingsForm">
          <div class="form-group">
            <label for="dashboardEnabledSelect">Dashboard Auto-Start</label>
            <select id="dashboardEnabledSelect" class="form-select">
              <option value="true">Enabled (auto-start with MCP server)</option>
              <option value="false">Disabled (manual start only)</option>
            </select>
          </div>
          <div class="form-hint">
            When disabled, use the <code>open_dashboard</code> MCP tool to start manually.
          </div>
          <div class="form-actions">
            <button type="button" id="saveDashboardBtn" class="btn btn-primary" style="display: none;">Save Settings</button>
            <span id="saveDashboardStatus" class="save-status"></span>
          </div>
        </div>
      </div>

      <!-- Configuration Card -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Configuration</span>
        </div>
        <div class="stat">
          <div class="stat-label">Project Path</div>
          <div class="stat-value small" id="projectPath">-</div>
        </div>
        <div class="stat">
          <div class="stat-label">Chunk Size</div>
          <div class="stat-value small" id="chunkSize">-</div>
        </div>
        <div class="stat">
          <div class="stat-label">Search Weights</div>
          <div class="stat-value small" id="searchWeights">-</div>
        </div>
        <div class="stat">
          <div class="stat-label">Include Patterns</div>
          <div class="patterns-list" id="includePatterns">
            <span class="pattern-tag">Loading...</span>
          </div>
        </div>
        <div class="stat">
          <div class="stat-label">Exclude Patterns</div>
          <div class="patterns-list" id="excludePatterns">
            <span class="pattern-tag exclude">Loading...</span>
          </div>
        </div>
      </div>

      <!-- Command Usage Card -->
      <div class="card double-width">
        <div class="card-header">
          <span class="card-title">Command Usage</span>
          <span class="badge" id="sessionBadge">This Session</span>
        </div>
        <div id="usageChartContainer">
          <div class="usage-empty" id="usageEmpty">No commands executed yet</div>
          <div id="chartWrapper">
            <table class="charts-css column show-primary-axis data-spacing-5" id="usage-chart" style="display: none;">
              <tbody id="usageChartBody"></tbody>
            </table>
          </div>
          <ul class="charts-css legend legend-inline legend-square" id="chartLegend" style="display: none;"></ul>
          <div class="usage-total" id="usageTotal" style="display: none;">
            <span class="usage-total-label">Total Commands</span>
            <span class="usage-total-count" id="totalCount">0</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Beads Section -->
    <div class="beads-section" id="beadsSection" style="display: none;">
      <div class="beads-header">
        <svg class="beads-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="5" r="3"/>
          <circle cx="12" cy="12" r="3"/>
          <circle cx="12" cy="19" r="3"/>
          <line x1="12" y1="8" x2="12" y2="9"/>
          <line x1="12" y1="15" x2="12" y2="16"/>
        </svg>
        <span class="beads-title">Beads Issue Tracker</span>
      </div>
      <div class="grid">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Status</span>
            <span class="badge success" id="beadsBadge">Active</span>
          </div>
          <div class="beads-stats">
            <div class="beads-stat">
              <span class="beads-stat-value" id="beadsReadyCount">0</span>
              <span class="beads-stat-label">Ready</span>
            </div>
            <div class="beads-stat">
              <span class="beads-stat-value" id="beadsOpenCount">0</span>
              <span class="beads-stat-label">Open</span>
            </div>
            <div class="beads-stat">
              <span class="beads-stat-value" id="beadsTotalCount">0</span>
              <span class="beads-stat-label">Total</span>
            </div>
          </div>
          <div class="beads-daemon-status" id="beadsDaemonStatus">
            <div class="status-dot" id="beadsDaemonDot"></div>
            <span id="beadsDaemonText">Daemon status unknown</span>
          </div>
          <div class="stat" style="margin-top: 12px;" id="beadsSyncBranchStat">
            <div class="stat-label">Sync Branch</div>
            <div class="stat-value small" id="beadsSyncBranch">-</div>
          </div>
        </div>

        <div class="card" style="grid-column: span 2;">
          <div class="card-header">
            <span class="card-title">Ready Tasks</span>
            <span class="badge" id="readyTasksBadge">0 tasks</span>
          </div>
          <div class="beads-issues" id="beadsIssuesList">
            <div class="beads-empty">No ready tasks</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Server Log Section -->
    <div class="log-section" id="logSection">
      <div class="log-header" id="logHeader">
        <svg class="log-toggle" id="logToggle" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6 4l4 4-4 4"/>
        </svg>
        <span class="log-title">Server Logs</span>
        <span class="badge" id="logCount">0</span>
        <div class="log-actions">
          <button type="button" id="clearLogsBtn">Clear</button>
        </div>
      </div>
      <div class="log-container" id="logContainer">
        <div class="log-empty" id="logEmpty">No logs yet. Logs will appear when indexing or other server operations occur.</div>
      </div>
    </div>
  </div>

  <script>
    // Theme management
    function getStoredTheme() {
      return localStorage.getItem('lance-context-theme') || 'dark';
    }

    function setTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('lance-context-theme', theme);
    }

    function toggleTheme() {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      setTheme(newTheme);
    }

    // Initialize theme
    setTheme(getStoredTheme());

    // Theme toggle button
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    // State
    let isConnected = false;
    let eventSource = null;

    // DOM elements
    const connectionDot = document.getElementById('connectionDot');
    const connectionText = document.getElementById('connectionText');
    const versionBadge = document.getElementById('versionBadge');
    const projectNameHeader = document.getElementById('projectName');
    const indexBadge = document.getElementById('indexBadge');
    const fileCount = document.getElementById('fileCount');
    const chunkCount = document.getElementById('chunkCount');
    const lastUpdated = document.getElementById('lastUpdated');
    const embeddingBackend = document.getElementById('embeddingBackend');
    const embeddingStatus = document.getElementById('embeddingStatus');
    const indexPath = document.getElementById('indexPath');
    const fallbackBanner = document.getElementById('fallbackBanner');
    const fallbackContent = document.getElementById('fallbackContent');
    const projectPath = document.getElementById('projectPath');
    const chunkSize = document.getElementById('chunkSize');
    const searchWeights = document.getElementById('searchWeights');
    const includePatterns = document.getElementById('includePatterns');
    const excludePatterns = document.getElementById('excludePatterns');
    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    // Reindex button elements
    const reindexBtn = document.getElementById('reindexBtn');
    const forceReindexBtn = document.getElementById('forceReindexBtn');
    const reindexStatus = document.getElementById('reindexStatus');

    // Log panel elements
    const logHeader = document.getElementById('logHeader');
    const logToggle = document.getElementById('logToggle');
    const logContainer = document.getElementById('logContainer');
    const logCount = document.getElementById('logCount');
    const logEmpty = document.getElementById('logEmpty');
    const clearLogsBtn = document.getElementById('clearLogsBtn');
    let logEntryCount = 0;

    // Embedding settings form elements
    const backendSelect = document.getElementById('backendSelect');
    const concurrencySelect = document.getElementById('concurrencySelect');
    const batchSizeSelect = document.getElementById('batchSizeSelect');
    const ollamaSettingsGroup = document.getElementById('ollamaSettingsGroup');
    const apiKeyGroup = document.getElementById('apiKeyGroup');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveEmbeddingBtn = document.getElementById('saveEmbeddingBtn');
    const saveStatus = document.getElementById('saveStatus');

    // Track saved settings to detect changes
    let savedSettings = { backend: 'gemini', ollamaConcurrency: '1', batchSize: '256' };

    // Check if current form values differ from saved settings
    function hasSettingsChanged() {
      const currentBackend = backendSelect.value;
      const currentConcurrency = concurrencySelect.value;
      const currentBatchSize = batchSizeSelect.value;
      const needsApiKey = currentBackend === 'gemini';
      const hasNewApiKey = needsApiKey && apiKeyInput.value.trim() !== '';

      return currentBackend !== savedSettings.backend ||
             currentConcurrency !== savedSettings.ollamaConcurrency ||
             currentBatchSize !== savedSettings.batchSize ||
             hasNewApiKey;
    }

    // Update save button visibility based on changes
    function updateSaveButtonVisibility() {
      saveEmbeddingBtn.style.display = hasSettingsChanged() ? 'inline-block' : 'none';
      saveStatus.textContent = '';
    }

    // Toggle settings visibility based on backend selection
    function updateBackendVisibility() {
      const backend = backendSelect.value;
      const needsApiKey = backend === 'gemini';
      const apiKeyLabel = document.getElementById('apiKeyLabel');
      const apiKeyHint = document.getElementById('apiKeyHint');

      apiKeyGroup.style.display = needsApiKey ? 'block' : 'none';
      ollamaSettingsGroup.style.display = backend === 'ollama' ? 'block' : 'none';

      // Update API key label and hint based on backend (static trusted content)
      if (backend === 'gemini') {
        apiKeyLabel.textContent = 'Gemini API Key';
        apiKeyInput.placeholder = 'AIza...';
        apiKeyHint.textContent = '';
        const link = document.createElement('a');
        link.href = 'https://aistudio.google.com/app/apikey';
        link.target = '_blank';
        link.textContent = 'Google AI Studio';
        apiKeyHint.appendChild(document.createTextNode('Get your free API key at '));
        apiKeyHint.appendChild(link);
      }

      updateSaveButtonVisibility();
    }
    backendSelect.addEventListener('change', updateBackendVisibility);
    concurrencySelect.addEventListener('change', updateSaveButtonVisibility);
    batchSizeSelect.addEventListener('change', updateSaveButtonVisibility);
    apiKeyInput.addEventListener('input', updateSaveButtonVisibility);

    // Load current embedding settings
    async function loadEmbeddingSettings() {
      try {
        const response = await fetch('/api/settings/embedding');
        if (response.ok) {
          const settings = await response.json();
          const backend = settings.backend || 'gemini';
          const concurrency = String(settings.ollamaConcurrency || 1);
          const batchSize = String(settings.batchSize || 256);

          // Update saved settings
          savedSettings = { backend, ollamaConcurrency: concurrency, batchSize };

          // Update form values
          backendSelect.value = backend;
          concurrencySelect.value = concurrency;
          batchSizeSelect.value = batchSize;
          updateBackendVisibility();
          updateSaveButtonVisibility();

          // Update status badge
          if (settings.backend === 'gemini') {
            if (settings.hasApiKey) {
              embeddingStatus.textContent = 'API Key Set';
              embeddingStatus.className = 'badge success';
            } else {
              embeddingStatus.textContent = 'API Key Required';
              embeddingStatus.className = 'badge warning';
            }
          } else {
            embeddingStatus.textContent = 'Local';
            embeddingStatus.className = 'badge';
          }
        }
      } catch (error) {
        console.error('Failed to load embedding settings:', error);
      }
    }

    // Save embedding settings
    saveEmbeddingBtn.addEventListener('click', async function() {
      const backend = backendSelect.value;
      const apiKey = apiKeyInput.value.trim();
      const needsApiKey = backend === 'gemini';

      if (needsApiKey && !apiKey) {
        saveStatus.textContent = 'API key required for Gemini';
        saveStatus.className = 'save-status error';
        return;
      }

      saveEmbeddingBtn.disabled = true;
      saveStatus.textContent = 'Saving...';
      saveStatus.className = 'save-status';

      try {
        const response = await fetch('/api/settings/embedding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            backend,
            apiKey: needsApiKey ? apiKey : undefined,
            ollamaConcurrency: parseInt(concurrencySelect.value, 10),
            batchSize: parseInt(batchSizeSelect.value, 10)
          })
        });

        const result = await response.json();

        if (response.ok) {
          saveStatus.textContent = 'Saved! Restart server to apply.';
          saveStatus.className = 'save-status success';
          apiKeyInput.value = ''; // Clear the input
          // Delay reload so user sees the success message (reload clears status)
          setTimeout(loadEmbeddingSettings, 3000);
        } else {
          saveStatus.textContent = result.error || 'Failed to save';
          saveStatus.className = 'save-status error';
        }
      } catch (error) {
        saveStatus.textContent = 'Network error';
        saveStatus.className = 'save-status error';
      } finally {
        saveEmbeddingBtn.disabled = false;
      }
    });

    // Load embedding settings on page load
    loadEmbeddingSettings();

    // Reindex button handlers
    async function triggerReindex(force) {
      reindexBtn.disabled = true;
      forceReindexBtn.disabled = true;
      reindexStatus.textContent = force ? 'Starting force reindex...' : 'Starting reindex...';
      reindexStatus.className = 'save-status';

      try {
        const response = await fetch('/api/reindex', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force })
        });

        const result = await response.json();

        if (response.ok) {
          reindexStatus.textContent = result.message;
          reindexStatus.className = 'save-status success';
        } else {
          reindexStatus.textContent = result.error || 'Failed to start reindex';
          reindexStatus.className = 'save-status error';
          reindexBtn.disabled = false;
          forceReindexBtn.disabled = false;
        }
      } catch (error) {
        reindexStatus.textContent = 'Network error';
        reindexStatus.className = 'save-status error';
        reindexBtn.disabled = false;
        forceReindexBtn.disabled = false;
      }
    }

    reindexBtn.addEventListener('click', () => triggerReindex(false));
    forceReindexBtn.addEventListener('click', () => triggerReindex(true));

    // Re-enable buttons when indexing completes (SSE event)
    function enableReindexButtons() {
      reindexBtn.disabled = false;
      forceReindexBtn.disabled = false;
    }

    // Log panel handlers
    let logCollapsed = false;

    logHeader.addEventListener('click', () => {
      logCollapsed = !logCollapsed;
      logToggle.classList.toggle('collapsed', logCollapsed);
      logContainer.classList.toggle('collapsed', logCollapsed);
    });

    clearLogsBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Don't toggle collapse
      logContainer.innerHTML = '<div class="log-empty" id="logEmpty">No logs yet. Logs will appear when indexing or other server operations occur.</div>';
      logEntryCount = 0;
      logCount.textContent = '0';
    });

    function addLogEntry(level, message, timestamp) {
      // Remove empty message if present
      const emptyMsg = logContainer.querySelector('.log-empty');
      if (emptyMsg) emptyMsg.remove();

      const entry = document.createElement('div');
      entry.className = 'log-entry log-' + level;

      const time = document.createElement('span');
      time.className = 'log-time';
      const date = new Date(timestamp);
      time.textContent = date.toLocaleTimeString();

      const msg = document.createElement('span');
      msg.className = 'log-message';
      msg.textContent = message;

      entry.appendChild(time);
      entry.appendChild(msg);
      logContainer.appendChild(entry);

      // Auto-scroll to bottom
      logContainer.scrollTop = logContainer.scrollHeight;

      // Update count
      logEntryCount++;
      logCount.textContent = String(logEntryCount);

      // Keep max 500 entries
      while (logContainer.children.length > 500) {
        logContainer.removeChild(logContainer.firstChild);
      }
    }

    // Dashboard settings form elements
    const dashboardBadge = document.getElementById('dashboardBadge');
    const dashboardEnabled = document.getElementById('dashboardEnabled');
    const dashboardEnabledSelect = document.getElementById('dashboardEnabledSelect');
    const saveDashboardBtn = document.getElementById('saveDashboardBtn');
    const saveDashboardStatus = document.getElementById('saveDashboardStatus');

    // Track saved dashboard settings
    let savedDashboardEnabled = true;

    // Check if dashboard settings changed
    function hasDashboardSettingsChanged() {
      return dashboardEnabledSelect.value !== String(savedDashboardEnabled);
    }

    // Update dashboard save button visibility
    function updateDashboardSaveButtonVisibility() {
      saveDashboardBtn.style.display = hasDashboardSettingsChanged() ? 'inline-block' : 'none';
      saveDashboardStatus.textContent = '';
    }

    dashboardEnabledSelect.addEventListener('change', updateDashboardSaveButtonVisibility);

    // Load current dashboard settings
    async function loadDashboardSettings() {
      try {
        const response = await fetch('/api/settings/dashboard');
        if (response.ok) {
          const settings = await response.json();
          savedDashboardEnabled = settings.enabled;

          // Update form and display
          dashboardEnabledSelect.value = String(settings.enabled);
          dashboardEnabled.textContent = settings.enabled ? 'Enabled' : 'Disabled';
          dashboardBadge.textContent = settings.enabled ? 'Enabled' : 'Disabled';
          dashboardBadge.className = settings.enabled ? 'badge success' : 'badge warning';
          updateDashboardSaveButtonVisibility();
        }
      } catch (error) {
        console.error('Failed to load dashboard settings:', error);
      }
    }

    // Save dashboard settings
    saveDashboardBtn.addEventListener('click', async function() {
      const enabled = dashboardEnabledSelect.value === 'true';

      saveDashboardBtn.disabled = true;
      saveDashboardStatus.textContent = 'Saving...';
      saveDashboardStatus.className = 'save-status';

      try {
        const response = await fetch('/api/settings/dashboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled })
        });

        const result = await response.json();

        if (response.ok) {
          saveDashboardStatus.textContent = result.message || 'Saved!';
          saveDashboardStatus.className = 'save-status success';
          loadDashboardSettings();
        } else {
          saveDashboardStatus.textContent = result.error || 'Failed to save';
          saveDashboardStatus.className = 'save-status error';
        }
      } catch (error) {
        saveDashboardStatus.textContent = 'Network error';
        saveDashboardStatus.className = 'save-status error';
      } finally {
        saveDashboardBtn.disabled = false;
      }
    });

    // Load dashboard settings on page load
    loadDashboardSettings();

    // Format date
    function formatDate(isoString) {
      if (!isoString) return 'Never';
      const date = new Date(isoString);
      return date.toLocaleString();
    }

    // Update connection status
    function setConnected(connected) {
      isConnected = connected;
      connectionDot.className = 'status-dot' + (connected ? ' connected' : '');
      connectionText.textContent = connected ? 'Connected' : 'Disconnected';
    }

    // Update index status
    function updateStatus(status) {
      if (status.indexed) {
        indexBadge.textContent = 'Indexed';
        indexBadge.className = 'badge success';
      } else {
        indexBadge.textContent = 'Not Indexed';
        indexBadge.className = 'badge warning';
      }

      if (status.isIndexing) {
        indexBadge.textContent = 'Indexing...';
        indexBadge.className = 'badge warning pulsing';
        progressContainer.className = 'progress-container active';
      } else {
        progressContainer.className = 'progress-container';
      }

      fileCount.textContent = status.fileCount.toLocaleString();
      chunkCount.textContent = status.chunkCount.toLocaleString();
      lastUpdated.textContent = formatDate(status.lastUpdated);
      embeddingBackend.textContent = status.embeddingBackend || 'Not configured';
      indexPath.textContent = status.indexPath || '-';

      // Update version badge
      if (status.version) {
        versionBadge.textContent = 'v' + status.version;
      }

      // Show fallback banner if a backend fallback occurred
      if (status.backendFallback && status.backendFallback.occurred) {
        const fb = status.backendFallback;
        // Clear and rebuild content safely using DOM methods
        fallbackContent.textContent = '';
        const strong = document.createElement('strong');
        strong.textContent = fb.originalBackend;
        fallbackContent.appendChild(strong);
        fallbackContent.appendChild(document.createTextNode(' failed to initialize: '));
        const code = document.createElement('code');
        code.textContent = fb.reason;
        fallbackContent.appendChild(code);
        fallbackContent.appendChild(document.createElement('br'));
        fallbackContent.appendChild(document.createTextNode('Your index may need rebuilding if embedding dimensions differ between backends.'));
        fallbackBanner.classList.add('visible');
      } else {
        fallbackBanner.classList.remove('visible');
      }
    }

    // Update config display
    function updateConfig(config) {
      projectPath.textContent = config.projectPath || '-';

      // Update project name in header
      if (config.projectName) {
        projectNameHeader.textContent = config.projectName;
      } else if (config.projectPath) {
        // Fallback to extracting from path if projectName not provided
        projectNameHeader.textContent = config.projectPath.split('/').pop() || config.projectPath;
      }

      if (config.chunking) {
        chunkSize.textContent = config.chunking.maxLines + ' lines (overlap: ' + config.chunking.overlap + ')';
      }

      if (config.search) {
        searchWeights.textContent = 'Semantic: ' + (config.search.semanticWeight * 100) + '%, Keyword: ' + (config.search.keywordWeight * 100) + '%';
      }

      // Update patterns
      if (config.patterns) {
        includePatterns.innerHTML = config.patterns
          .slice(0, 10)
          .map(p => '<span class="pattern-tag">' + escapeHtml(p) + '</span>')
          .join('');
        if (config.patterns.length > 10) {
          includePatterns.innerHTML += '<span class="pattern-tag">+' + (config.patterns.length - 10) + ' more</span>';
        }
      }

      if (config.excludePatterns) {
        excludePatterns.innerHTML = config.excludePatterns
          .slice(0, 6)
          .map(p => '<span class="pattern-tag exclude">' + escapeHtml(p) + '</span>')
          .join('');
        if (config.excludePatterns.length > 6) {
          excludePatterns.innerHTML += '<span class="pattern-tag exclude">+' + (config.excludePatterns.length - 6) + ' more</span>';
        }
      }
    }

    // Format seconds into human-readable time
    function formatEta(seconds) {
      if (seconds === undefined || seconds === null || seconds < 0) return '';
      if (seconds < 60) return seconds + 's';
      if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return mins + 'm ' + secs + 's';
      }
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return hours + 'h ' + mins + 'm';
    }

    // Update progress
    function updateProgress(progress) {
      const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
      progressFill.style.width = percent + '%';
      let text = progress.message;
      if (progress.etaSeconds !== undefined && progress.etaSeconds > 0) {
        text += ' (ETA: ' + formatEta(progress.etaSeconds) + ')';
      }
      progressText.textContent = text;
    }

    // Charts.css color mapping - distinct colors for all commands
    const commandColors = {
      // Core search
      'search_code': '#58a6ff',        // blue
      'search_similar': '#39c5cf',     // cyan
      // Indexing
      'index_codebase': '#3fb950',     // green
      'get_index_status': '#a371f7',   // purple
      'clear_index': '#f85149',        // red
      'get_project_instructions': '#d29922',  // orange
      // Git
      'commit': '#f778ba',             // pink
      // Symbol analysis
      'get_symbols_overview': '#79c0ff',  // light blue
      'find_symbol': '#56d364',        // bright green
      'find_referencing_symbols': '#bc8cff', // light purple
      'search_for_pattern': '#ff9f43', // bright orange
      'replace_symbol_body': '#ff6b6b', // coral
      'insert_before_symbol': '#feca57', // yellow
      'insert_after_symbol': '#48dbfb', // sky blue
      'rename_symbol': '#ff9ff3',      // light pink
      // Memory
      'write_memory': '#1dd1a1',       // teal
      'read_memory': '#5f27cd',        // deep purple
      'list_memories': '#ee5a24',      // burnt orange
      'delete_memory': '#c23616',      // dark red
      'edit_memory': '#009432',        // forest green
      // Worktree
      'create_worktree': '#12CBC4',    // turquoise
      'list_worktrees': '#B53471',     // magenta
      'remove_worktree': '#ED4C67',    // watermelon
      'worktree_status': '#F79F1F',    // golden
      // Clustering
      'list_concepts': '#A3CB38',      // lime
      'search_by_concept': '#1289A7',  // cerulean
      'summarize_codebase': '#D980FA', // lavender
      // Dashboard
      'open_dashboard': '#e17055'      // terra cotta
    };

    // Update usage chart using charts.css
    const usageEmpty = document.getElementById('usageEmpty');
    const usageChartEl = document.getElementById('usage-chart');
    const usageChartBody = document.getElementById('usageChartBody');
    const chartLegend = document.getElementById('chartLegend');
    const usageTotal = document.getElementById('usageTotal');
    const totalCount = document.getElementById('totalCount');

    function updateUsage(data) {
      const { usage, total } = data;

      if (total === 0) {
        usageEmpty.style.display = 'block';
        usageChartEl.style.display = 'none';
        chartLegend.style.display = 'none';
        usageTotal.style.display = 'none';
        return;
      }

      usageEmpty.style.display = 'none';
      usageChartEl.style.display = '';
      chartLegend.style.display = 'flex';
      usageTotal.style.display = 'flex';

      // Sort by count descending (most used first)
      const sortedUsage = usage.slice().sort(function(a, b) { return b.count - a.count; });
      const maxCount = Math.max(...sortedUsage.map(u => u.count));

      let chartHtml = '';
      let legendHtml = '';
      let idx = 0;
      for (const item of sortedUsage) {
        if (item.count === 0) continue;

        const percent = maxCount > 0 ? (item.count / maxCount) : 0;
        const color = commandColors[item.command] || '#58a6ff';

        chartHtml += '<tr data-idx="' + idx + '">';
        chartHtml += '<th scope="row"></th>';
        chartHtml += '<td style="--size: ' + percent + '; --color: ' + color + ';"></td>';
        chartHtml += '</tr>';

        legendHtml += '<li data-idx="' + idx + '" style="--color: ' + color + ';">' + escapeHtml(item.label) + ' (' + item.count + ')</li>';
        idx++;
      }

      usageChartBody.innerHTML = chartHtml;
      chartLegend.innerHTML = legendHtml;
      totalCount.textContent = total;

      // Legend hover highlighting
      chartLegend.querySelectorAll('li').forEach(function(li) {
        li.addEventListener('mouseenter', function() {
          var idx = this.getAttribute('data-idx');
          usageChartEl.classList.add('legend-hover');
          var row = usageChartBody.querySelector('tr[data-idx="' + idx + '"]');
          if (row) row.classList.add('highlight');
        });
        li.addEventListener('mouseleave', function() {
          usageChartEl.classList.remove('legend-hover');
          usageChartBody.querySelectorAll('tr').forEach(function(tr) {
            tr.classList.remove('highlight');
          });
        });
      });

      // Bar hover highlighting (reverse - highlight legend item)
      usageChartBody.querySelectorAll('td').forEach(function(td) {
        td.addEventListener('mouseenter', function() {
          var idx = this.parentElement.getAttribute('data-idx');
          chartLegend.classList.add('bar-hover');
          var legendItem = chartLegend.querySelector('li[data-idx="' + idx + '"]');
          if (legendItem) legendItem.classList.add('highlight');
        });
        td.addEventListener('mouseleave', function() {
          chartLegend.classList.remove('bar-hover');
          chartLegend.querySelectorAll('li').forEach(function(li) {
            li.classList.remove('highlight');
          });
        });
      });
    }

    // Beads section elements
    const beadsSection = document.getElementById('beadsSection');
    const beadsReadyCount = document.getElementById('beadsReadyCount');
    const beadsOpenCount = document.getElementById('beadsOpenCount');
    const beadsTotalCount = document.getElementById('beadsTotalCount');
    const beadsDaemonDot = document.getElementById('beadsDaemonDot');
    const beadsDaemonText = document.getElementById('beadsDaemonText');
    const beadsSyncBranch = document.getElementById('beadsSyncBranch');
    const beadsIssuesList = document.getElementById('beadsIssuesList');
    const readyTasksBadge = document.getElementById('readyTasksBadge');

    function updateBeads(data) {
      if (!data.available) {
        beadsSection.style.display = 'none';
        return;
      }

      beadsSection.style.display = 'block';
      beadsReadyCount.textContent = data.readyCount;
      beadsOpenCount.textContent = data.openCount;
      beadsTotalCount.textContent = data.issueCount;
      readyTasksBadge.textContent = data.readyCount + ' task' + (data.readyCount !== 1 ? 's' : '');

      // Daemon status
      if (data.daemonRunning) {
        beadsDaemonDot.className = 'status-dot connected';
        beadsDaemonText.textContent = 'Daemon running';
      } else {
        beadsDaemonDot.className = 'status-dot';
        beadsDaemonText.textContent = 'Daemon not running';
      }

      // Sync branch
      beadsSyncBranch.textContent = data.syncBranch || 'Not configured';

      // Issues list
      if (data.issues && data.issues.length > 0) {
        let html = '';
        for (const issue of data.issues) {
          const hasDescription = issue.description && issue.description.trim();
          html += '<div class="beads-issue" onclick="toggleBeadsIssue(this)">';
          html += '<span class="beads-issue-id">' + escapeHtml(issue.id) + '</span>';
          html += '<div class="beads-issue-content">';
          html += '<div class="beads-issue-title">';
          html += '<svg class="beads-issue-expand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>';
          html += '<span>' + escapeHtml(issue.title) + '</span>';
          html += '</div>';
          html += '<div class="beads-issue-meta">';
          if (issue.issue_type) {
            html += '<span class="beads-issue-type">' + escapeHtml(issue.issue_type) + '</span>';
          }
          if (issue.priority) {
            html += '<span class="beads-issue-priority">';
            html += '<span class="priority-dot priority-' + issue.priority + '"></span>';
            html += 'P' + issue.priority;
            html += '</span>';
          }
          html += '</div>';
          if (hasDescription) {
            html += '<div class="beads-issue-description">' + escapeHtml(issue.description) + '</div>';
          } else {
            html += '<div class="beads-issue-description beads-issue-no-description">No description available</div>';
          }
          html += '</div>';
          html += '</div>';
        }
        beadsIssuesList.innerHTML = html;
      } else {
        beadsIssuesList.innerHTML = '<div class="beads-empty">No ready tasks</div>';
      }
    }

    // Toggle beads issue expansion
    function toggleBeadsIssue(element) {
      element.classList.toggle('expanded');
    }

    // Escape HTML to prevent XSS
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Fetch initial data
    async function fetchData() {
      // Use Promise.allSettled to handle partial failures gracefully
      const results = await Promise.allSettled([
        fetch('/api/status'),
        fetch('/api/config'),
        fetch('/api/usage'),
        fetch('/api/beads')
      ]);

      let currentStatus = null;
      let currentConfig = null;

      // Process status result
      if (results[0].status === 'fulfilled' && results[0].value.ok) {
        try {
          currentStatus = await results[0].value.json();
          updateStatus(currentStatus);
        } catch (e) {
          // Silently handle parse errors
        }
      }

      // Process config result
      if (results[1].status === 'fulfilled' && results[1].value.ok) {
        try {
          currentConfig = await results[1].value.json();
          updateConfig(currentConfig);
        } catch (e) {
          // Silently handle parse errors
        }
      }

      // Check if configured backend differs from running backend
      if (currentStatus && currentConfig) {
        const runningBackend = currentStatus.embeddingBackend;
        const configuredBackend = currentConfig.embedding?.backend;
        if (configuredBackend && runningBackend && configuredBackend !== runningBackend) {
          embeddingBackend.innerHTML = runningBackend + ' <span class="badge warning" title="Restart required to use ' + configuredBackend + '">\u26a0 restart needed</span>';
        }
      }

      // Process usage result
      if (results[2].status === 'fulfilled' && results[2].value.ok) {
        try {
          const usage = await results[2].value.json();
          updateUsage(usage);
        } catch (e) {
          console.error('Failed to parse usage:', e);
        }
      }

      // Process beads result
      if (results[3].status === 'fulfilled' && results[3].value.ok) {
        try {
          const beads = await results[3].value.json();
          updateBeads(beads);
        } catch (e) {
          console.error('Failed to parse beads:', e);
        }
      }
    }

    // Console greeting
    console.log(\`
%c     _      _                  _ _   _                  __ _
%c _ __ (_) ___| | _____ _ __ ___ (_) |_| |__   ___  ___  / _| |___      ____ _ _ __ ___
%c| '_ \\\\| |/ __| |/ / __| '_ \\\` _ \\\\| | __| '_ \\\\ / __|/ _ \\\\| |_| __\\\\ \\\\ /\\\\ / / _\\\` | '__/ _ \\\\
%c| | | | | (__|   <\\\\__ \\\\ | | | | | | |_| | | |\\\\__ \\\\ (_) |  _| |_ \\\\ V  V / (_| | | |  __/
%c|_| |_|_|\\\\___|_|\\\\_\\\\___/_| |_| |_|_|\\\\__|_| |_||___/\\\\___/|_|  \\\\__| \\\\_/\\\\_/ \\\\__,_|_|  \\\\___|
\`,
      'color: #58a6ff',
      'color: #58a6ff',
      'color: #58a6ff',
      'color: #58a6ff',
      'color: #58a6ff'
    );
    console.log(
      '%c📧 Get in touch: %cme@nicksmith.software',
      'color: #666; font-size: 14px;',
      'color: #58a6ff; font-size: 14px; text-decoration: underline;'
    );

    // Connect to SSE
    function connectSSE() {
      if (eventSource) {
        eventSource.close();
      }

      eventSource = new EventSource('/api/events');

      eventSource.addEventListener('connected', (e) => {
        setConnected(true);
        fetchData();
      });

      eventSource.addEventListener('indexing:progress', (e) => {
        const progress = JSON.parse(e.data);
        progressContainer.className = 'progress-container active';
        indexBadge.textContent = 'Indexing...';
        indexBadge.className = 'badge warning pulsing';
        updateProgress(progress);
      });

      eventSource.addEventListener('indexing:start', () => {
        progressContainer.className = 'progress-container active';
        indexBadge.textContent = 'Indexing...';
        indexBadge.className = 'badge warning pulsing';
        progressFill.style.width = '0%';
        progressText.textContent = 'Starting...';
        reindexBtn.disabled = true;
        forceReindexBtn.disabled = true;
      });

      eventSource.addEventListener('indexing:complete', () => {
        progressContainer.className = 'progress-container';
        enableReindexButtons();
        reindexStatus.textContent = '';
        fetchData();
      });

      eventSource.addEventListener('status:change', (e) => {
        const status = JSON.parse(e.data);
        updateStatus(status);
      });

      eventSource.addEventListener('usage:update', (e) => {
        const usage = JSON.parse(e.data);
        // The event data is the usage array, need to compute total
        const total = usage.reduce((sum, u) => sum + u.count, 0);
        updateUsage({ usage, total });
      });

      eventSource.addEventListener('heartbeat', () => {
        // Just keep connection alive
      });

      eventSource.addEventListener('server:log', (e) => {
        const logData = JSON.parse(e.data);
        // Add to log panel only (no console output)
        addLogEntry(logData.level, logData.message, logData.timestamp);
      });

      eventSource.onerror = (e) => {
        setConnected(false);
        // EventSource will automatically reconnect
      };
    }

    // Initialize
    fetchData();
    connectSSE();
  </script>
</body>
</html>`;
}
