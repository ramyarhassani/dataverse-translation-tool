/**
 * Debug log panel – shows real-time log of everything happening.
 * Visible as a collapsible panel at the bottom of the UI.
 */

let logContainer: HTMLElement | null = null;
let logList: HTMLElement | null = null;
let logCount = 0;

export function initDebugLog(): void {
  if (logContainer) return;

  logContainer = document.createElement('div');
  logContainer.className = 'debug-log';
  logContainer.innerHTML = `
    <div class="debug-log-header">
      <span>📋 Activity Log</span>
      <div class="debug-log-actions">
        <button class="debug-btn" id="debugClear" title="Clear log">🗑️</button>
        <button class="debug-btn" id="debugToggle" title="Toggle log">▼</button>
      </div>
    </div>
    <div class="debug-log-body">
      <div class="debug-log-list" id="debugLogList"></div>
    </div>
  `;

  document.body.appendChild(logContainer);
  logList = logContainer.querySelector('#debugLogList');

  logContainer.querySelector('#debugToggle')?.addEventListener('click', () => {
    logContainer!.classList.toggle('collapsed');
    const btn = logContainer!.querySelector('#debugToggle')!;
    const isCollapsed = logContainer!.classList.contains('collapsed');
    btn.textContent = isCollapsed ? '▲' : '▼';
    document.documentElement.style.setProperty('--log-panel-height', isCollapsed ? '40px' : '250px');
  });

  logContainer.querySelector('#debugClear')?.addEventListener('click', () => {
    if (logList) logList.innerHTML = '';
    logCount = 0;
  });

  log('info', 'Debug log initialized');
}

export function log(level: 'info' | 'success' | 'warn' | 'error' | 'debug', message: string, detail?: string): void {
  if (!logList) initDebugLog();

  logCount++;
  const time = new Date().toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const icons: Record<string, string> = {
    info: 'ℹ️',
    success: '✅',
    warn: '⚠️',
    error: '❌',
    debug: '🔍',
  };

  const entry = document.createElement('div');
  entry.className = `debug-entry debug-${level}`;

  let html = `<span class="debug-time">${time}</span> ${icons[level] || ''} <span class="debug-msg">${escapeHtml(message)}</span>`;
  if (detail) {
    html += `<div class="debug-detail">${escapeHtml(detail)}</div>`;
  }
  entry.innerHTML = html;

  logList!.appendChild(entry);
  logList!.scrollTop = logList!.scrollHeight;

  // Also log to console
  const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  consoleFn(`[TranslationTool] ${message}`, detail || '');
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
