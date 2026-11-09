import type { State } from './automation';

// The demo and live app share pricing rules, but live records use the real clock
// and describe actions recorded by a person rather than simulated delivery.
export function liveChange(state: State, change: (current: State) => State): State {
  const next = change({ ...state, now: Date.now() });
  const existing = new Set(state.activity.map(item => item.id));
  return { ...next, activity: next.activity.map(item => existing.has(item.id) ? item : {
    ...item,
    title: item.title.replace('Quote sent · simulated', 'Quote marked as sent').replace('Payment recorded · simulated', 'Payment recorded'),
    detail: item.detail
      .replace('recorded manually for this demo', 'recorded by your team')
      .replace('demo only, no payment request sent', 'ready for your review')
      .replace('demo only', 'ready for your review')
      .replace('no money collected', 'recorded manually; no payment processed')
      .replace('Applies to future actions in this browser', 'Applies to future workspace actions'),
  }) };
}
