export function checklistProgress(items?: { done: boolean }[]) {
  const total = items?.length ?? 0;
  const done = items?.filter((i) => i.done).length ?? 0;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}
