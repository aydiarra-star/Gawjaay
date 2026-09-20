export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

export function generateOrderNumber(): string {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = (date.getMonth()+1).toString().padStart(2,'0');
  const d = date.getDate().toString().padStart(2,'0');
  const rand = Math.random().toString(36).substring(2,6).toUpperCase();
  return `GJ-${y}${m}${d}-${rand}`;
}
