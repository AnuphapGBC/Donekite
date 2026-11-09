import type { Followup } from '@/lib/enquiry-list';

const labels = { scheduled: 'Scheduled', due: 'Follow-up due', ready: 'Draft ready', paused: 'Paused', none: 'No follow-up' };

export function FollowupStatus({ followup, showDate = true }: { followup: Followup; showDate?: boolean }) {
  if (followup.status === 'none') return <span className="followup-empty" aria-label="No follow-up">—</span>;
  return <span className="followup-status" data-status={followup.status}>
    <span className="followup-label">{labels[followup.status]}</span>
    {showDate && followup.dueAt !== undefined && followup.status !== 'ready' && <time dateTime={new Date(followup.dueAt).toISOString()}>
      {new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto' }).format(followup.dueAt)} · Toronto
    </time>}
  </span>;
}
