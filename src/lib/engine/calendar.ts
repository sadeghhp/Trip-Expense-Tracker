export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + (365 * gy) + Math.floor((gy2 + 3) / 4)
    - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + gdm[gm - 1];

  let jy = -1595 + 33 * Math.floor(days / 12053);
  days = days % 12053;

  jy += 4 * Math.floor(days / 1461);
  days = days % 1461;

  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }

  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);

  return [jy, jm, jd];
}

export function formatDateDisplay(isoDate: string, calendar: 'gregorian' | 'jalali'): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;

  const gy = parseInt(parts[0]);
  const gm = parseInt(parts[1]);
  const gd = parseInt(parts[2]);

  if (calendar === 'jalali' && gy >= 1900) {
    const [jy, jm, jd] = gregorianToJalali(gy, gm, gd);
    return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
  }

  return `${gy}/${String(gm).padStart(2, '0')}/${String(gd).padStart(2, '0')}`;
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayForCalendar(calendar: 'gregorian' | 'jalali'): string {
  const now = new Date();
  const gy = now.getFullYear();
  const gm = now.getMonth() + 1;
  const gd = now.getDate();

  if (calendar === 'jalali') {
    const [jy, jm, jd] = gregorianToJalali(gy, gm, gd);
    return `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`;
  }

  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}
