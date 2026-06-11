/**
 * Full-screen loading overlay with spinner, status messages, and elapsed timer.
 */

const REASSURING_MESSAGES = [
  'Still working on it...',
  'This can take a minute for large solutions...',
  'Hang tight, almost there...',
  'Talking to Dataverse...',
  'Processing your request...',
  'Still going, don\'t worry...',
  'Large solutions take longer...',
  'Working hard behind the scenes...',
];

let overlayEl: HTMLElement | null = null;
let timerInterval: number | null = null;
let messageInterval: number | null = null;
let startTime = 0;

export function showLoadingOverlay(initialMessage: string): void {
  hideLoadingOverlay();

  startTime = Date.now();

  overlayEl = document.createElement('div');
  overlayEl.className = 'loading-overlay';
  overlayEl.innerHTML = `
    <div class="loading-card">
      <div class="loading-spinner"></div>
      <div class="loading-message">${escapeHtml(initialMessage)}</div>
      <div class="loading-timer">0s</div>
    </div>
  `;

  document.body.appendChild(overlayEl);

  // Update timer every second
  timerInterval = window.setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const timerEl = overlayEl?.querySelector('.loading-timer');
    if (timerEl) {
      if (elapsed < 60) {
        timerEl.textContent = `${elapsed}s`;
      } else {
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        timerEl.textContent = `${mins}m ${secs}s`;
      }
    }
  }, 1000);

  // Show reassuring messages after 8 seconds, then every 10 seconds
  messageInterval = window.setTimeout(() => {
    let msgIndex = 0;
    const showNext = () => {
      const msgEl = overlayEl?.querySelector('.loading-submessage');
      if (!msgEl) {
        const sub = document.createElement('div');
        sub.className = 'loading-submessage';
        sub.textContent = REASSURING_MESSAGES[msgIndex % REASSURING_MESSAGES.length];
        overlayEl?.querySelector('.loading-card')?.appendChild(sub);
      } else {
        msgEl.textContent = REASSURING_MESSAGES[msgIndex % REASSURING_MESSAGES.length];
      }
      msgIndex++;
    };
    showNext();
    messageInterval = window.setInterval(showNext, 10000);
  }, 8000) as unknown as number;
}

export function updateLoadingMessage(message: string): void {
  if (!overlayEl) return;
  const msgEl = overlayEl.querySelector('.loading-message');
  if (msgEl) msgEl.textContent = message;
}

export function hideLoadingOverlay(): void {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (messageInterval) { clearInterval(messageInterval); clearTimeout(messageInterval); messageInterval = null; }
  if (overlayEl) { overlayEl.remove(); overlayEl = null; }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
