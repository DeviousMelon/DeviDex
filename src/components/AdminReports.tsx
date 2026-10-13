import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  REPORT_REASONS,
  getReports,
  resolveReport,
  timeAgo,
  type AdminReport,
  type ReportStatus,
} from '../lib/social';
import { adminRemoveForumContent } from '../lib/forums';

const TYPE_LABELS: Record<AdminReport['targetType'], string> = {
  user: 'Collector',
  message: 'Chat message',
  forum_post: 'Forum post',
  forum_comment: 'Forum comment',
};

const reasonLabel = (reason: AdminReport['reason']) =>
  REPORT_REASONS.find((option) => option.value === reason)?.label ?? reason;

/**
 * Admin report queue. Chat messages are private, so admins only ever see the
 * snapshot taken at report time, never the rest of the conversation.
 */
export function AdminReports() {
  const [filter, setFilter] = useState<ReportStatus | 'all'>('open');
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getReports(filter);
    setReports(result.data);
    setError(result.error);
    setLoading(false);
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  async function resolve(report: AdminReport, status: ReportStatus) {
    setBusyId(report.id);
    const result = await resolveReport(report.id, status, notes[report.id] ?? report.adminNote ?? '');
    setBusyId(null);
    if (result.error) setError(result.error);
    await load();
  }

  async function removeContent(report: AdminReport) {
    if (!window.confirm('Remove this content from the forums? It is replaced with "[removed by an admin]".')) return;
    setBusyId(report.id);
    const removal = await adminRemoveForumContent(report.targetType === 'forum_post' ? 'post' : 'comment', report.targetId);
    if (removal.error) {
      setError(removal.error);
      setBusyId(null);
      return;
    }
    const note = notes[report.id]?.trim() || 'Content removed.';
    await resolveReport(report.id, 'actioned', note);
    setBusyId(null);
    await load();
  }

  return (
    <section className="section admin-section admin-reports">
      <div className="section-heading">
        <div>
          <p className="eyebrow">MODERATION</p>
          <h2>Reports</h2>
          <p className="muted">What people have flagged. The reported person is never told who reported them.</p>
        </div>
        <div className="segmented" role="group" aria-label="Filter reports">
          {(['open', 'actioned', 'dismissed', 'all'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={filter === option ? 'is-active' : undefined}
              onClick={() => setFilter(option)}
            >
              {option[0].toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="form-message form-message--error">{error}</p>}

      {loading ? (
        <p className="muted">Loading reports…</p>
      ) : reports.length === 0 ? (
        <div className="social-empty">
          <strong>{filter === 'open' ? 'Nothing to deal with.' : 'No reports here.'}</strong>
          <span>{filter === 'open' ? 'Enjoy it while it lasts.' : 'Try another filter.'}</span>
        </div>
      ) : (
        <ul className="admin-report-list">
          {reports.map((report) => (
            <li key={report.id} className={`admin-report admin-report--${report.status}`}>
              <header>
                <span className="admin-report__type">{TYPE_LABELS[report.targetType]}</span>
                <strong>{reasonLabel(report.reason)}</strong>
                <span className="muted">
                  by {report.reporterUsername ? `@${report.reporterUsername}` : 'a deleted account'} · {timeAgo(report.createdAt)}
                </span>
              </header>

              <p className="admin-report__target">
                About{' '}
                {report.targetUsername
                  ? <Link to={`/u/${encodeURIComponent(report.targetUsername)}`}>@{report.targetUsername}</Link>
                  : 'a deleted account'}
                {report.targetType === 'forum_post' && (
                  <> · <Link to={`/forums/post/${report.targetId}`}>Open post</Link></>
                )}
              </p>

              {report.contentSnapshot && (
                <blockquote className="admin-report__snapshot">{report.contentSnapshot}</blockquote>
              )}
              {report.details && <p className="admin-report__details">“{report.details}”</p>}

              {report.status === 'open' ? (
                <div className="admin-report__actions">
                  <input
                    aria-label="Admin note"
                    placeholder="Note for yourself (optional)"
                    maxLength={1000}
                    value={notes[report.id] ?? ''}
                    onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))}
                  />
                  {(report.targetType === 'forum_post' || report.targetType === 'forum_comment') && (
                    <button className="button button--danger button--small" type="button" disabled={busyId === report.id} onClick={() => void removeContent(report)}>
                      Remove content
                    </button>
                  )}
                  <button className="button button--primary button--small" type="button" disabled={busyId === report.id} onClick={() => void resolve(report, 'actioned')}>
                    Mark handled
                  </button>
                  <button className="button button--secondary button--small" type="button" disabled={busyId === report.id} onClick={() => void resolve(report, 'dismissed')}>
                    Dismiss
                  </button>
                </div>
              ) : (
                <div className="admin-report__resolution">
                  <span>
                    {report.status === 'actioned' ? 'Handled' : 'Dismissed'}
                    {report.resolvedByUsername && ` by @${report.resolvedByUsername}`}
                    {report.resolvedAt && ` ${timeAgo(report.resolvedAt)}`}
                    {report.adminNote && ` · ${report.adminNote}`}
                  </span>
                  <button className="text-button" type="button" disabled={busyId === report.id} onClick={() => void resolve(report, 'open')}>
                    Reopen
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
