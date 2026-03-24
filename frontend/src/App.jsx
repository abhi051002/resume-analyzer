import { useEffect, useMemo, useRef, useState } from "react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

function ScoreRing({ score, label }) {
  const [displayedScore, setDisplayedScore] = useState(0);
  const size = 144;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const normalizedScore = Math.max(0, Math.min(100, score ?? 0));
  const offset = circumference - (normalizedScore / 100) * circumference;
  const cls =
    normalizedScore >= 70
      ? "score-high"
      : normalizedScore >= 40
        ? "score-mid"
        : "score-low";

  useEffect(() => {
    let raf = null;
    const duration = 900;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      setDisplayedScore(Math.round(normalizedScore * progress));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [normalizedScore]);

  return (
    <div className={`score-ring ${cls}`}>
      <svg viewBox={`0 0 ${size} ${size}`} className="score-ring-svg">
        <circle
          className="score-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
        />
        <circle
          className="score-ring-progress"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="score-ring-content">
        <span className="score-number">{displayedScore}</span>
        <span className="score-label">{label}</span>
      </div>
    </div>
  );
}

function SectionCard({ title, icon, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="section-card">
      <button className="section-header" onClick={() => setOpen((v) => !v)}>
        <h3>
          <span>{icon}</span> {title}
        </h3>
        <svg
          className={`section-chevron ${open ? "open" : ""}`}
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div className={`section-body-wrap ${open ? "open" : ""}`}>
        <div className="section-body-inner">
          <div className="section-body">{children}</div>
        </div>
      </div>
    </div>
  );
}

function FilePreviewModal({ file, onClose }) {
  const [objectUrl] = useState(() => URL.createObjectURL(file));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-filename">{file.name}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {file.type === "application/pdf" ? (
            <iframe src={objectUrl} title="PDF Preview" className="modal-iframe" />
          ) : (
            <img src={objectUrl} alt="Resume preview" className="modal-img" />
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const typewriterText = useMemo(
    () => [
      "Turn your resume into interview magnet material.",
      "Get ATS insight in seconds.",
      "Fix gaps before recruiters spot them.",
    ],
    [],
  );
  const loadingSteps = useMemo(
    () => ["Extracting text...", "Classifying...", "Analyzing..."],
    [],
  );

  const [mode, setMode] = useState("text");
  const [resumeText, setResumeText] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [uploadedFile, setUploadedFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [tagline, setTagline] = useState("");
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [confetti, setConfetti] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let index = 0;
    let textIndex = 0;
    let deleting = false;
    let timeoutId = null;

    const animate = () => {
      const fullText = typewriterText[textIndex];
      if (!deleting) {
        index += 1;
        setTagline(fullText.slice(0, index));
        if (index === fullText.length) {
          deleting = true;
          timeoutId = setTimeout(animate, 1200);
          return;
        }
      } else {
        index -= 1;
        setTagline(fullText.slice(0, index));
        if (index === 0) {
          deleting = false;
          textIndex = (textIndex + 1) % typewriterText.length;
          setTaglineIndex(textIndex);
        }
      }
      timeoutId = setTimeout(animate, deleting ? 30 : 55);
    };

    animate();
    return () => clearTimeout(timeoutId);
  }, [typewriterText]);

  useEffect(() => {
    if (!loading) return;
    setLoadingStep(0);
    let step = 0;
    const interval = setInterval(() => {
      step = Math.min(step + 1, loadingSteps.length - 1);
      setLoadingStep(step);
    }, 900);
    return () => clearInterval(interval);
  }, [loading, loadingSteps.length]);

  function handleFileChange(file) {
    if (!file) return;
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Only PDF, JPG, PNG, or WEBP files are supported.");
      return;
    }
    setError(null);
    setUploadedFile(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFileChange(e.dataTransfer.files[0]);
  }

  const canSubmit =
    !loading && (mode === "text" ? resumeText.trim().length > 0 : uploadedFile !== null);

  async function handleAnalyze() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let res;
      if (mode === "text") {
        res = await fetch(BACKEND_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeText, targetRole }),
        });
      } else {
        const form = new FormData();
        form.append("file", uploadedFile);
        form.append("targetRole", targetRole);
        res = await fetch(BACKEND_URL, { method: "POST", body: form });
      }

      const data = await res.json();

      if (!res.ok) {
        const message = data.reason
          ? `${data.error} — ${data.reason}`
          : data.error || `Server error: ${res.statusText}`;
        throw new Error(message);
      }

      setResult(data);
      if ((data.relevanceScore ?? 0) >= 80) {
        const burst = Array.from({ length: 18 }, (_, i) => ({
          id: `${Date.now()}-${i}`,
          left: Math.random() * 100,
          delay: Math.random() * 0.3,
          duration: 0.9 + Math.random() * 0.8,
          hue: 240 + Math.floor(Math.random() * 100),
        }));
        setConfetti(burst);
        setTimeout(() => setConfetti([]), 1800);
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(m) {
    setMode(m);
    setResult(null);
    setError(null);
    setUploadedFile(null);
    setResumeText("");
    setShowPreview(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function getFileIcon(file) {
    if (!file) return "⬆️";
    if (file.type === "application/pdf") return "📄";
    return "🖼️";
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="app">
      <header>
        <h1>Resume Analyzer</h1>
        <p className="hero-tagline">
          {tagline}
          <span className="type-cursor" key={taglineIndex}>
            |
          </span>
        </p>
      </header>
      <div className="particles" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="input-card">
        <div className="tabs">
          <button
            className={`tab-btn ${mode === "text" ? "active" : ""}`}
            onClick={() => switchMode("text")}
          >
            ✏️ Paste Text
          </button>
          <button
            className={`tab-btn ${mode === "file" ? "active" : ""}`}
            onClick={() => switchMode("file")}
          >
            📄 Upload File
          </button>
        </div>

        {mode === "text" && (
          <>
            <div className="label-row">
              <label htmlFor="resume-input">Your Resume</label>
              {resumeText && (
                <button
                  className="clear-text-btn"
                  onClick={() => {
                    setResumeText("");
                    setError(null);
                    setResult(null);
                  }}
                >
                  × Clear
                </button>
              )}
            </div>
            <textarea
              id="resume-input"
              placeholder="Paste your resume text here…"
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
            />
          </>
        )}

        <div className="target-role-row">
          <label htmlFor="target-role-input">Target Role / Job Description (optional)</label>
          <textarea
            id="target-role-input"
            className="target-role-input"
            placeholder="Paste job title, requirements, or a short JD to tailor feedback..."
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
          />
        </div>

        {mode === "file" && (
          <>
            <div
              className={`drop-zone ${dragOver ? "drag-over" : ""} ${uploadedFile ? "has-file" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !uploadedFile && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange(e.target.files[0])}
              />

              {uploadedFile ? (
                <>
                  <span className="drop-icon">{getFileIcon(uploadedFile)}</span>
                  <span className="drop-filename">{uploadedFile.name}</span>
                  <span className="drop-hint">{formatFileSize(uploadedFile.size)}</span>
                  <div className="file-actions">
                    {/* Preview button */}
                    <button
                      className="file-action-btn preview-btn"
                      title="Preview file"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowPreview(true);
                      }}
                    >
                      👁️
                    </button>
                    {/* Clear button */}
                    <button
                      className="file-action-btn clear-file-btn"
                      title="Remove file"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUploadedFile(null);
                        setError(null);
                        setResult(null);
                        setShowPreview(false);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <span className="drop-hint">Click × to remove</span>
                </>
              ) : (
                <>
                  <span className="drop-icon">⬆️</span>
                  <span className="drop-title">Drop your file here</span>
                  <span className="drop-hint">PDF, JPG, PNG, WEBP · or click to browse</span>
                </>
              )}
            </div>
          </>
        )}

        <button
          className="analyze-btn"
          onClick={handleAnalyze}
          disabled={!canSubmit}
        >
          {loading ? "Analyzing…" : "Analyze Resume"}
        </button>
      </div>

      {loading && (
        <div className="loading">
          <div className="spinner" />
          <div className="loading-text">
            <strong>{loadingSteps[loadingStep]}</strong>
            <span>Analyzing your resume, this may take a moment.</span>
          </div>
        </div>
      )}

      {error && <div className="error-banner">⚠️ {error}</div>}

      {result && (
        <div className="results">
          <div className="score-card">
            <ScoreRing score={result.relevanceScore ?? 0} label="Relevance" />
            <ScoreRing score={result.atsScore ?? 0} label="ATS" />
            <ScoreRing score={result.toneScore ?? 0} label="Tone" />
            <ScoreRing score={result.readabilityScore ?? 0} label="Readability" />
            <div className="score-info">
              <h2>Score Breakdown</h2>
              <p>{result.overallFeedback}</p>
            </div>
          </div>

          {result.strengths?.length > 0 && (
            <SectionCard title="Strengths" icon="✅" defaultOpen>
              <ul className="list-green">
                {result.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </SectionCard>
          )}

          {result.weaknesses?.length > 0 && (
            <SectionCard title="Weaknesses" icon="⚠️" defaultOpen={false}>
              <ul className="list-red">
                {result.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </SectionCard>
          )}

          {result.suggestions?.length > 0 && (
            <SectionCard title="Suggestions for Improvement" icon="💡" defaultOpen>
              <ul className="list-accent">
                {result.suggestions.map((s, i) => (
                  <li key={i} className="copy-line">
                    <span>{s}</span>
                    <button
                      className="copy-btn"
                      onClick={() => navigator.clipboard?.writeText(s)}
                    >
                      Copy
                    </button>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {result.missingKeywords?.length > 0 && (
            <SectionCard title="Missing Keywords" icon="🔍" defaultOpen={false}>
              <div className="tags">
                {result.missingKeywords.map((kw, i) => (
                  <span key={i} className="tag">{kw}</span>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {showPreview && uploadedFile && (
        <FilePreviewModal file={uploadedFile} onClose={() => setShowPreview(false)} />
      )}
      <div className="confetti-wrap" aria-hidden="true">
        {confetti.map((piece) => (
          <span
            key={piece.id}
            className="confetti-piece"
            style={{
              left: `${piece.left}%`,
              animationDelay: `${piece.delay}s`,
              animationDuration: `${piece.duration}s`,
              backgroundColor: `hsl(${piece.hue}, 90%, 62%)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}