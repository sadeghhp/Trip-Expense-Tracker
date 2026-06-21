import { writable } from 'svelte/store';

export interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  text: string;
}

let nextId = 0;
export const toasts = writable<ToastMessage[]>([]);

export function showToast(text: string, type: 'success' | 'error' | 'info' = 'success') {
  const id = nextId++;
  toasts.update(msgs => [...msgs, { id, type, text }]);
  setTimeout(() => {
    toasts.update(msgs => msgs.filter(m => m.id !== id));
  }, 3000);
}
