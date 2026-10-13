import { useEffect, useRef, useState, type FormEvent } from 'react';
import { REPORT_REASONS, submitReport, type ReportReason, type ReportTargetType } from '../lib/social';

type ReportDialogProps = {
  open: boolean;
  targetType: ReportTargetType;
  targetId: string;
  /** Shown in the heading, e.g. "@Ash" or "this message". */
  targetLabel: string;
  onClose: () => void;
};

/**
 * One report form for users, messages, posts and comments. The database takes
 * its own snapshot of the reported content, so this only sends an id + reason.
 */
export function ReportDialog({ open, targetType, targetId, targetLabel, onClose }: ReportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setReason('harassment');
      setDetails('');
      setMessage(null);
      setSent(false);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await submitReport(targetType, targetId, reason, details);
    setBusy(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setSent(true);
  }

  return (
    <dialog ref={dialogRef} className="social-dialog" onClose={onClose} aria-labelledby="report-dialog-title">
      {sent ? (
        <div className="social-dialog__body">
          <h2 id="report-dialog-title">Report sent</h2>
          <p className="muted">
            Thanks. An admin will take a look. The person you reported isn't told who reported them.
          </p>
          <div className="social-dialog__actions">
            <button className="button button--primary" type="button" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <form className="social-dialog__body" onSubmit={handleSubmit}>
          <h2 id="report-dialog-title">Report {targetLabel}</h2>

          <fieldset className="report-reasons">
            <legend>What's wrong?</legend>
            {REPORT_REASONS.map((option) => (
              <label key={option.value} className={reason === option.value ? 'is-selected' : undefined}>
                <input
                  type="radio"
                  name="report-reason"
                  value={option.value}
                  checked={reason === option.value}
                  onChange={() => setReason(option.value)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>

          <label className="social-field">
            Anything else an admin should know? <span className="muted">(optional)</span>
            <textarea
              value={details}
              maxLength={1000}
              rows={3}
              onChange={(event) => setDetails(event.target.value)}
            />
          </label>

          {message && <p className="form-message form-message--error">{message}</p>}

          <div className="social-dialog__actions">
            <button className="button button--secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="button button--danger" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
