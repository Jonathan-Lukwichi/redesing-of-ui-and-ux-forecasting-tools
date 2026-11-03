import { useRef, useState } from 'react';
import Card from '../ui/Card';
import Icon from '../Icon';

const MARK = { waiting: '·', uploading: '…', ok: '✓', failed: '✕', rejected: '✕' };

/**
 * One drop zone for every file. Presentational: the page classifies and
 * uploads (onFiles), this shows the count and a line per file.
 *
 * progress: {current, total, name} while uploading, {total, ok, failed, finished: true} after.
 * results:  [{key, name, state, message, bestFit?}]
 */
export default function DropZone({ disabled, disabledReason, progress, results, onFiles, onSendToBestFit }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);

  const take = (files) => {
    if (!disabled && files?.length) onFiles(files);
  };

  return (
    <Card className="pl-drop-card">
      <Card.Header icon={<Icon name="upload" size={16} />}>
        <Card.Title>Drop every file here</Card.Title>
        <Card.Description>
          The monthly registers (.xlsx) and the expected .csv files, in any mix. Each register is
          transformed as it arrives, one at a time, so keep this tab open until the count finishes.
        </Card.Description>
      </Card.Header>

      <div
        className="pl-drop"
        data-over={over ? '1' : undefined}
        data-disabled={disabled ? '1' : undefined}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer?.files); }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.csv"
          style={{ display: 'none' }}
          onChange={(e) => { take(Array.from(e.target.files || [])); e.target.value = ''; }}
        />
        <span className="pl-drop-text">{disabled && disabledReason ? disabledReason : 'Drag files here, or'}</span>
        <button
          className="btn btn-primary btn-sm"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Icon name="upload" size={12} /> Choose files
        </button>
      </div>

      {progress && (
        <div className="pl-progress tnum" role="status">
          {progress.finished
            ? `Finished ${progress.total} of ${progress.total}: ${progress.ok} uploaded, ${progress.failed} not uploaded.`
            : `Uploading ${progress.current} of ${progress.total}: ${progress.name}`}
        </div>
      )}

      {results.length > 0 && (
        <ul className="pl-results" aria-label="Upload results">
          {results.map((r) => (
            <li key={r.key} className="pl-result" data-state={r.state}>
              <span className="pl-result-mark" aria-hidden="true">{MARK[r.state]}</span>
              <div className="pl-result-body">
                <Card.FileLabel>{r.name}</Card.FileLabel>
                <div className="pl-result-msg">{r.message}</div>
                {r.bestFit && (
                  <button className="btn btn-sm" onClick={() => onSendToBestFit(r)}>
                    <Icon name="check" size={12} /> Upload there ({r.bestFit.label})
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
