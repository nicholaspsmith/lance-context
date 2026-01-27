/**
 * Lance logo SVG (embedded)
 */
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="40" height="40">
  <circle cx="100" cy="100" r="95" fill="#1a1a2e"/>
  <rect x="45" y="55" width="110" height="100" rx="15" ry="15" fill="#4a90d9"/>
  <line x1="100" y1="55" x2="100" y2="30" stroke="#4a90d9" stroke-width="6" stroke-linecap="round"/>
  <circle cx="100" cy="25" r="10" fill="#ff6b6b"/>
  <rect x="30" y="80" width="15" height="40" rx="5" ry="5" fill="#357abd"/>
  <rect x="155" y="80" width="15" height="40" rx="5" ry="5" fill="#357abd"/>
  <rect x="55" y="70" width="90" height="70" rx="10" ry="10" fill="#5ba3ec"/>
  <rect x="50" y="82" width="45" height="35" rx="8" ry="8" fill="none" stroke="#1a1a2e" stroke-width="6"/>
  <rect x="105" y="82" width="45" height="35" rx="8" ry="8" fill="none" stroke="#1a1a2e" stroke-width="6"/>
  <line x1="95" y1="100" x2="105" y2="100" stroke="#1a1a2e" stroke-width="6"/>
  <line x1="50" y1="95" x2="35" y2="90" stroke="#1a1a2e" stroke-width="5" stroke-linecap="round"/>
  <line x1="150" y1="95" x2="165" y2="90" stroke="#1a1a2e" stroke-width="5" stroke-linecap="round"/>
  <ellipse cx="62" cy="92" rx="8" ry="5" fill="rgba(255,255,255,0.3)"/>
  <ellipse cx="117" cy="92" rx="8" ry="5" fill="rgba(255,255,255,0.3)"/>
  <circle cx="72" cy="100" r="12" fill="#1a1a2e"/>
  <circle cx="128" cy="100" r="12" fill="#1a1a2e"/>
  <circle cx="75" cy="97" r="5" fill="#ffffff"/>
  <circle cx="131" cy="97" r="5" fill="#ffffff"/>
  <path d="M 75 130 Q 100 145 125 130" fill="none" stroke="#1a1a2e" stroke-width="4" stroke-linecap="round"/>
  <ellipse cx="60" cy="120" rx="8" ry="5" fill="rgba(255,107,107,0.4)"/>
  <ellipse cx="140" cy="120" rx="8" ry="5" fill="rgba(255,107,107,0.4)"/>
  <circle cx="55" cy="145" r="5" fill="#357abd"/>
  <circle cx="145" cy="145" r="5" fill="#357abd"/>
</svg>`;

/**
 * Favicon as base64 data URL
 */
const FAVICON_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="95" fill="#1a1a2e"/><rect x="45" y="55" width="110" height="100" rx="15" ry="15" fill="#4a90d9"/><line x1="100" y1="55" x2="100" y2="30" stroke="#4a90d9" stroke-width="6" stroke-linecap="round"/><circle cx="100" cy="25" r="10" fill="#ff6b6b"/><rect x="30" y="80" width="15" height="40" rx="5" ry="5" fill="#357abd"/><rect x="155" y="80" width="15" height="40" rx="5" ry="5" fill="#357abd"/><rect x="55" y="70" width="90" height="70" rx="10" ry="10" fill="#5ba3ec"/><rect x="50" y="82" width="45" height="35" rx="8" ry="8" fill="none" stroke="#1a1a2e" stroke-width="6"/><rect x="105" y="82" width="45" height="35" rx="8" ry="8" fill="none" stroke="#1a1a2e" stroke-width="6"/><line x1="95" y1="100" x2="105" y2="100" stroke="#1a1a2e" stroke-width="6"/><circle cx="72" cy="100" r="12" fill="#1a1a2e"/><circle cx="128" cy="100" r="12" fill="#1a1a2e"/><circle cx="75" cy="97" r="5" fill="#fff"/><circle cx="131" cy="97" r="5" fill="#fff"/><path d="M 75 130 Q 100 145 125 130" fill="none" stroke="#1a1a2e" stroke-width="4" stroke-linecap="round"/></svg>`)}`;

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
  <link rel="icon" type="image/svg+xml" href="${FAVICON_SVG}">
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
      align-items: center;
      gap: 12px;
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

    .logo svg {
      width: 40px;
      height: 40px;
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
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
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
          <div class="logo">${LOGO_SVG}</div>
          lance-context
          <span class="version-badge" id="versionBadge"></span>
        </h1>
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
              <option value="auto">Auto (detect available)</option>
              <option value="jina">Jina AI (cloud)</option>
              <option value="ollama">Ollama (local)</option>
            </select>
          </div>
          <div class="form-group" id="ollamaSettingsGroup">
            <label for="concurrencySelect">Ollama Concurrency</label>
            <select id="concurrencySelect" class="form-select">
              <option value="10">10 (conservative)</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200" selected>200 (default)</option>
              <option value="500">500</option>
              <option value="1000">1000 (high-end)</option>
              <option value="2000">2000 (maximum)</option>
            </select>
            <div class="form-hint">Concurrent embedding requests to Ollama</div>
          </div>
          <div class="form-group">
            <label for="batchSizeSelect">Batch Size</label>
            <select id="batchSizeSelect" class="form-select">
              <option value="32">32 (conservative)</option>
              <option value="64">64</option>
              <option value="100">100</option>
              <option value="200" selected>200 (default)</option>
              <option value="500">500</option>
              <option value="1000">1000 (maximum)</option>
            </select>
            <div class="form-hint">Chunks per embedding batch</div>
          </div>
          <div class="form-group" id="apiKeyGroup" style="display: none;">
            <label for="apiKeyInput">Jina API Key</label>
            <input type="password" id="apiKeyInput" class="form-input" placeholder="jina_..." />
            <div class="form-hint">Get your free API key at <a href="https://jina.ai/" target="_blank">jina.ai</a></div>
          </div>
          <div class="form-actions">
            <button type="button" id="saveEmbeddingBtn" class="btn btn-primary">Save Settings</button>
            <span id="saveStatus" class="save-status"></span>
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
      <div class="card full-width">
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
    const indexBadge = document.getElementById('indexBadge');
    const fileCount = document.getElementById('fileCount');
    const chunkCount = document.getElementById('chunkCount');
    const lastUpdated = document.getElementById('lastUpdated');
    const embeddingBackend = document.getElementById('embeddingBackend');
    const embeddingStatus = document.getElementById('embeddingStatus');
    const indexPath = document.getElementById('indexPath');
    const projectPath = document.getElementById('projectPath');
    const chunkSize = document.getElementById('chunkSize');
    const searchWeights = document.getElementById('searchWeights');
    const includePatterns = document.getElementById('includePatterns');
    const excludePatterns = document.getElementById('excludePatterns');
    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    // Embedding settings form elements
    const backendSelect = document.getElementById('backendSelect');
    const concurrencySelect = document.getElementById('concurrencySelect');
    const batchSizeSelect = document.getElementById('batchSizeSelect');
    const ollamaSettingsGroup = document.getElementById('ollamaSettingsGroup');
    const apiKeyGroup = document.getElementById('apiKeyGroup');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveEmbeddingBtn = document.getElementById('saveEmbeddingBtn');
    const saveStatus = document.getElementById('saveStatus');

    // Toggle settings visibility based on backend selection
    function updateBackendVisibility() {
      const isJina = backendSelect.value === 'jina';
      apiKeyGroup.style.display = isJina ? 'block' : 'none';
      ollamaSettingsGroup.style.display = isJina ? 'none' : 'block';
    }
    backendSelect.addEventListener('change', updateBackendVisibility);

    // Load current embedding settings
    async function loadEmbeddingSettings() {
      try {
        const response = await fetch('/api/settings/embedding');
        if (response.ok) {
          const settings = await response.json();
          backendSelect.value = settings.backend || 'auto';
          concurrencySelect.value = String(settings.ollamaConcurrency || 200);
          batchSizeSelect.value = String(settings.batchSize || 200);
          updateBackendVisibility();

          // Update status badge
          if (settings.hasApiKey) {
            embeddingStatus.textContent = 'API Key Set';
            embeddingStatus.className = 'badge success';
          } else if (settings.backend === 'ollama') {
            embeddingStatus.textContent = 'Local';
            embeddingStatus.className = 'badge';
          } else {
            embeddingStatus.textContent = 'Not Configured';
            embeddingStatus.className = 'badge warning';
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

      if (backend === 'jina' && !apiKey) {
        saveStatus.textContent = 'API key required for Jina';
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
            backend: backend === 'auto' ? 'ollama' : backend,
            apiKey: backend === 'jina' ? apiKey : undefined,
            ollamaConcurrency: parseInt(concurrencySelect.value, 10),
            batchSize: parseInt(batchSizeSelect.value, 10)
          })
        });

        const result = await response.json();

        if (response.ok) {
          saveStatus.textContent = 'Saved! Restart server to apply.';
          saveStatus.className = 'save-status success';
          apiKeyInput.value = ''; // Clear the input
          loadEmbeddingSettings(); // Reload to update status
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
    }

    // Update config display
    function updateConfig(config) {
      projectPath.textContent = config.projectPath || '-';

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
      'summarize_codebase': '#D980FA'  // lavender
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
          console.error('Failed to parse status:', e);
        }
      }

      // Process config result
      if (results[1].status === 'fulfilled' && results[1].value.ok) {
        try {
          currentConfig = await results[1].value.json();
          updateConfig(currentConfig);
        } catch (e) {
          console.error('Failed to parse config:', e);
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
      });

      eventSource.addEventListener('indexing:complete', () => {
        progressContainer.className = 'progress-container';
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

      eventSource.onerror = () => {
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
