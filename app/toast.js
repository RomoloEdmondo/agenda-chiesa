const toast = document.getElementById('notice');
const text = document.getElementById('toast-message');
let timeout;

function close() {
  clearTimeout(timeout);
  toast.hidden = true;
  text.textContent = '';
}

document.getElementById('toast-close').onclick = close;

export function notice(message,kind='success') {
  clearTimeout(timeout);
  toast.dataset.kind = kind;
  toast.hidden = false;
  text.textContent = message;
  timeout = setTimeout(close, kind==='error' ? 7000 : 5500);
}
