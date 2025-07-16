import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  DragEvent,
  ChangeEvent,
} from 'react';
import './App.css';

type AnnType = 's' | 'e' | 't';
interface Annotation { type: AnnType; time: number; fmItem: string; }

const SUPPORTED_MIME = ['video/mp4', 'video/webm', 'video/ogg'];
const SEEK_DELTA = 0.1;               // seconds ⬅ / ➡ jump

const App: React.FC = () => {
  /* ───────── refs & state ───────── */
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fmRef    = useRef<HTMLInputElement | null>(null);

  const [file,  setFile]        = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [fmItem,   setFmItem]   = useState('');
  const [now,      setNow]      = useState(0);
  const [clipActive, setClipActive] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  /* ───────── derived flags ──────── */
  const unequalStartsEnds = useMemo(() => {
    const numStarts = annotations.filter(a => a.type === 's').length;
    const numEnds   = annotations.filter(a => a.type === 'e').length;
    return numStarts !== numEnds;
  }, [annotations]);

  const hasOverlap = useMemo(() => {
    const seq = annotations
      .filter(a => a.type !== 't')
      .sort((a, b) => a.time - b.time);

    for (let i = 0; i < seq.length; i += 2) {
      if ((i + 1 >= seq.length) || seq[i].type !== 's' || seq[i + 1].type !== 'e')
        return true;               // odd count or mismatched pair  → overlap flag
    }
    return false;
  }, [annotations]);

  /* ───────── object URL ─────────── */
  const videoURL = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  useEffect(() => () => { if (videoURL) URL.revokeObjectURL(videoURL); }, [videoURL]);

  /* ───────── video events ───────── */
  const onLoaded = () => setDuration(videoRef.current?.duration || 0);
  const onTime   = () => setNow(videoRef.current?.currentTime || 0);

  /* ───────── global hot‑keys ────── */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      const inInput = tag === 'input' || tag === 'textarea';
      const vid = videoRef.current;

      /* f = focus FM input (unless already typing there) */
      if (e.key === 'f' && !inInput) {
        e.preventDefault();
        fmRef.current?.focus();
        return;
      }
      /* exit FM input on Esc */
      if (e.key === 'Escape' && inInput) {
        (e.target as HTMLElement).blur();
        return;
      }
      if (!vid || !file) return;

      /* play / pause */
      if (e.key === ' ') {
        e.preventDefault();
        vid.paused ? vid.play() : vid.pause();
        return;
      }

      /* ← / → seek */
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const delta = e.key === 'ArrowLeft' ? -SEEK_DELTA : SEEK_DELTA;
        vid.currentTime = Math.min(Math.max(0, vid.currentTime + delta), vid.duration);
        return;
      }

      /* ignore other keys while typing in FM */
      if (inInput) return;
      if (!['s', 'e', 't'].includes(e.key)) return;

      if (!fmItem) {
        alert('Please enter a label for the FM item');
        return;
      }

      const t = vid.currentTime;
      setAnnotations(prev => [
        ...prev,
        { type: e.key as AnnType, time: t, fmItem },
      ]);

      if (e.key === 's') setClipActive(true);
      if (e.key === 'e') setClipActive(false);
    };

    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [fmItem, file]);

  /* ───────── file choose / drop ─── */
  const takeFiles = (fs: FileList | null) => {
    if (!fs?.length) return;
    const f = fs[0];
    if (!SUPPORTED_MIME.includes(f.type)) {
      alert(`Unsupported: ${f.type || f.name}`);
      return;
    }
    setFile(f);
    setAnnotations([]);
    setClipActive(false);
    setDuration(0);
  };
  const drop   = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); takeFiles(e.dataTransfer.files); };
  const choose = (e: ChangeEvent<HTMLInputElement>) => takeFiles(e.target.files);

  /* ───────── annotation utils ───── */
  const removeAnn = (i: number) => setAnnotations(a => a.filter((_, ix) => ix !== i));
  const undo      = () => setAnnotations(a => a.slice(0, -1));

  /* ───────── save (unchanged) ───── */
  const save = async () => {
    if (!file) return;

    let final = annotations;
    if (clipActive && videoRef.current) {
      final = [...final, { type: 'e', time: videoRef.current.duration, fmItem }];
      setClipActive(false);
    }
    final.sort((a, b) => a.time - b.time);

    try {
      await fetch('http://localhost:5172/api/annotations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_path: file.name, annotations: final }),
      });
      alert('saved!');
      setAnnotations([]);
    } catch {
      alert('save failed');
    }
  };

  /* ───────── UI ─────────────────── */
  return (
    <div className="app">

      {/* ─ Column 1 · controls ─ */}
      <div className="col1">
        <h2>Video Temporal Annotator</h2>

        <p className="help">
          Hotkeys:&nbsp;
          <strong>Space</strong>=play/pause,&nbsp;
          <strong>s</strong>=start,&nbsp;<strong>e</strong>=end,&nbsp;
          <strong>t</strong>=key frame,&nbsp;
          <strong>←</strong>/<strong>→</strong>=±0.1 s,&nbsp;
          <strong>f</strong>=focus FM,&nbsp;<strong>Esc</strong>=leave FM
        </p>

        {/* file dropper */}
        <div
          className={`dropzone ${file ? 'has-file' : ''}`}
          onDragOver={e => e.preventDefault()}
          onDrop={drop}
          onClick={() => document.getElementById('fileInput')?.click()}
        >
          {file ? <strong>{file.name}</strong> : (
            <>
              <p>Drag &amp; drop a video or click to choose</p>
              <small>MP4 (H.264), WebM, Ogg/Theora</small>
            </>
          )}
          <input
            id="fileInput"
            type="file"
            accept={SUPPORTED_MIME.join(',')}
            hidden
            onChange={choose}
          />
        </div>

        {/* FM item + Save / Undo */}
        <label className="fm">
          FM item:&nbsp;
          <input
            ref={fmRef}
            type="text"
            value={fmItem}
            onChange={e => setFmItem(e.target.value)}
            placeholder="label"
          />
        </label>

        <div className="buttons">
          <button onClick={save} disabled={!file}>Save</button>
          <button onClick={undo} disabled={!annotations.length}>Undo</button>
        </div>
      </div>

      {/* ─ Column 2 · video ─ */}
      <div className="col2">
        {file && (
          <div className="video-wrap">
            <video
              ref={videoRef}
              className="video"
              src={videoURL}
              controls
              onLoadedMetadata={onLoaded}
              onTimeUpdate={onTime}
            />
            {duration > 0 && (
              <div className="annot-bar">
                {annotations.map((a, i) => (
                  <div
                    key={i}
                    className={`marker marker-${a.type}`}
                    style={{ left: `${(a.time / duration) * 100}%` }}
                    title={`${a.type}@${a.time.toFixed(2)}`}
                  />
                ))}
              </div>
            )}
            <div className="time">Current time: {now.toFixed(2)} s</div>
          </div>
        )}
      </div>

      {/* ─ Column 3 · table / warnings ─ */}
      <div className="col3">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>#</th><th>Type</th><th>Time (s)</th><th>FM</th><th/></tr>
            </thead>
            <tbody>
              {annotations.map((a, i) => (
                <tr key={`${a.time}-${i}`}>
                  <td>{i + 1}</td>
                  <td>{a.type}</td>
                  <td>{a.time.toFixed(2)}</td>
                  <td>{a.fmItem}</td>
                  <td><button onClick={() => removeAnn(i)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    

        {unequalStartsEnds && (
          <p className="warning">⚠ Number of starts and ends are unequal</p>
        )}
        {hasOverlap && (
          <p className="warning">⚠ Overlapping clips detected</p>
        )}
        {!unequalStartsEnds && !hasOverlap && annotations.length > 0 && (
          <p className="good">✔ Annotations look consistent</p>
        )}
      </div>
    </div>
  );
};

export default App;
