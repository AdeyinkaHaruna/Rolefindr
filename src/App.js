import { useState, useEffect, useRef } from "react";
import { Document, Packer, Paragraph, TextRun, AlignmentType, LevelFormat } from "docx";
import { createClient } from "@supabase/supabase-js";

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

// ─── THEMES ──────────────────────────────────────────────────────────────────
const DARK = {
  bg:"#1e1e24", surface:"#26262e", surfaceHi:"#2e2e38", border:"#38384a",
  text:"#f0f0f8", textSub:"#a0a0b8", textMute:"#68688a",
  accent:"#4f46e5", accentHi:"#6366f1",
};
const LIGHT = {
  bg:"#f4f4f8", surface:"#ffffff", surfaceHi:"#ebebf5", border:"#d4d4e0",
  text:"#18181f", textSub:"#44445a", textMute:"#8888aa",
  accent:"#4f46e5", accentHi:"#6366f1",
};

const PROFILE_COLORS = ["#FF8C55","#38bdf8","#e2b96e","#c4b5fd","#4ade80","#f472b6"];
const PROFILE_ICONS  = ["📊","🔒","🏨","🎧","💼","🛠","📱","🧠","🎯","📦"];

function pickIcon(title) {
  const t = title.toLowerCase();
  if (/product|owner|manager|pm\b/.test(t))        return "🎯";
  if (/cyber|security|soc|infosec|hacker/.test(t))  return "🔒";
  if (/market|seo|sem|ads|paid|brand/.test(t))      return "📊";
  if (/customer|support|service|care|helpdesk/.test(t)) return "🎧";
  if (/hotel|concierge|hospitality|front desk/.test(t)) return "🏨";
  if (/engineer|developer|software|coding|devops/.test(t)) return "🛠";
  if (/mobile|ios|android|app/.test(t))             return "📱";
  if (/data|analyst|science|ml|ai|research/.test(t)) return "🧠";
  if (/sales|account|revenue|business dev/.test(t)) return "💼";
  if (/design|ux|ui|creative|graphic/.test(t))      return "🎨";
  if (/finance|accounting|cfo|bookkeep/.test(t))    return "💰";
  if (/hr|human|recruit|talent/.test(t))            return "👥";
  if (/legal|law|compliance|attorney/.test(t))      return "⚖️";
  if (/health|nurse|medical|clinical/.test(t))      return "🏥";
  if (/teach|educat|instruct|tutor/.test(t))        return "📚";
  return PROFILE_ICONS[Math.floor(Math.random() * PROFILE_ICONS.length)];
}

const STATUS_CONFIG = {
  New:       { color:"#fff", bg:"#16a34a", border:"#16a34a" },
  Saved:     { color:"#fff", bg:"#d97706", border:"#d97706" },
  Applied:   { color:"#fff", bg:"#2563eb", border:"#2563eb" },
  Interview: { color:"#fff", bg:"#7c3aed", border:"#7c3aed" },
  Offer:     { color:"#fff", bg:"#db2777", border:"#db2777" },
  Rejected:  { color:"#fff", bg:"#dc2626", border:"#dc2626" },
};
const STATUSES = Object.keys(STATUS_CONFIG);

const WORK_TYPE_CONFIG = {
  Remote: { color:"#fff", bg:"#059669" },
  Hybrid: { color:"#1a1a1a", bg:"#fbbf24" },
  Onsite: { color:"#fff", bg:"#4f46e5" },
};

const TIME_FILTERS = [
  { label:"24hrs",   value:"24h" },
  { label:"3 days",  value:"3d" },
  { label:"1 week",  value:"week" },
  { label:"2 weeks", value:"2w" },
  { label:"3 weeks", value:"3w" },
  { label:"Month",   value:"month" },
  { label:"Any",     value:"any" },
];

const DEFAULT_PROFILES = [
  { id:"p1", title:"Digital Marketing", icon:"📊", color:"#FF8C55", remote:false,
    searchTerms:["PPC Manager","Google Ads Specialist","SEM Manager","Paid Search Analyst"], resume:"" },
  { id:"p2", title:"Cybersecurity", icon:"🔒", color:"#38bdf8", remote:false,
    searchTerms:["Cybersecurity Analyst","SOC Analyst","Information Security Analyst","Junior Security Analyst"], resume:"" },
  { id:"p3", title:"Concierge", icon:"🏨", color:"#e2b96e", remote:false,
    searchTerms:["Hotel Concierge","Front Desk Agent","Guest Services Agent","Front Desk Associate"], resume:"" },
  { id:"p4", title:"Remote Customer Service", icon:"🎧", color:"#c4b5fd", remote:true,
    searchTerms:["Remote Customer Service Representative","Virtual Customer Support","Work From Home Support Specialist","Remote Customer Care"], resume:"" },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function sortJobs(list) {
  return [...list].sort((a,b) => {
    if (b.match !== a.match) return b.match - a.match;
    if (b.salaryMax !== a.salaryMax) return b.salaryMax - a.salaryMax;
    return a.daysAgo - b.daysAgo;
  });
}

function computeMatch(job, profile) {
  if (!profile) return 60;
  const jobText = `${job.title} ${job.description}`.toLowerCase();
  const titleText = job.title.toLowerCase();

  // Title match
  const profileWords = profile.title.toLowerCase().split(" ").filter(w => w.length > 2);
  const titleHits = profileWords.filter(w => titleText.includes(w)).length;
  const titleScore = Math.round((titleHits / Math.max(profileWords.length, 1)) * 35);

  // Search term hits
  const termWords = [...new Set(
    profile.searchTerms.flatMap(t => t.toLowerCase().split(" ")).filter(w => w.length > 3)
  )];
  const termHits = termWords.filter(w => jobText.includes(w)).length;
  const termScore = Math.min(35, termHits * 5);

  // Resume overlap
  let resumeScore = 0;
  if (profile.resume) {
    const rWords = [...new Set(profile.resume.toLowerCase().split(/\W+/).filter(w => w.length > 4))];
    const overlap = rWords.filter(w => jobText.includes(w)).length;
    resumeScore = Math.min(25, Math.round(overlap / Math.max(rWords.length, 1) * 100));
  }

  return Math.min(99, Math.max(50, 30 + titleScore + termScore + resumeScore));
}

const salaryColor = (max, textSub = "#a0a0b8") => max >= 85000 ? "#4ade80" : max >= 55000 ? "#fbbf24" : textSub;

// ─── API ──────────────────────────────────────────────────────────────────────
async function callClaude(messages, system = "", maxTokens = 1000) {
  const body = { model:"claude-sonnet-4-20250514", max_tokens:maxTokens, messages };
  if (system) body.system = system;
  const res = await fetch(process.env.REACT_APP_API_URL || "https://rolefindr.onrender.com/api/claude", {
    method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)
  });
  const data = await res.json();
  return data.content?.map(c => c.text || "").join("") || "";
}

// ─── RESUME FILE PARSER ───────────────────────────────────────────────────────
async function parseResumeFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "txt") {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsText(file);
    });
  }
  if (ext === "pdf") {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = async (e) => {
        try {
          const base64 = e.target.result.split(",")[1];
          const body = {
            model:"claude-sonnet-4-20250514", max_tokens:2000,
            messages:[{ role:"user", content:[
              { type:"document", source:{ type:"base64", media_type:"application/pdf", data:base64 }},
              { type:"text", text:"Extract all text from this resume. Output ONLY the plain text." }
            ]}]
          };
          const resp = await fetch(process.env.REACT_APP_API_URL || "https://rolefindr.onrender.com/api/claude", {
            method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)
          });
          const data = await resp.json();
          res(data.content?.map(c => c.text || "").join("") || "");
        } catch(err) { rej(err); }
      };
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }
  if (ext === "docx") {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = async (e) => {
        try {
          const mammoth = await import("mammoth");
          const result = await mammoth.extractRawText({ arrayBuffer: e.target.result });
          res(result.value);
        } catch(err) { rej(new Error("Word upload failed. Try PDF or paste as text instead.")); }
      };
      r.onerror = rej;
      r.readAsArrayBuffer(file);
    });
  }
  throw new Error("Unsupported file type. Use PDF, Word, or TXT.");
}

// ─── FORMATTED TEXT RENDERER ─────────────────────────────────────────────────
function cleanText(raw) {
  if (!raw) return "";
  return raw
    .replace(/\\n/g, "\n")           // literal \n strings → real newlines
    .replace(/\\t/g, " ")            // literal \t → space
    .replace(/\\r/g, "")             // literal \r → remove
    .replace(/\\/g, "")              // remaining backslashes
    .replace(/\*{1,3}(.*?)\*{1,3}/g, "$1")  // **bold** → bold
    .replace(/_{1,2}(.*?)_{1,2}/g, "$1")     // __bold__ → bold
    .replace(/^[-_=]{3,}\s*$/gm, "")         // divider lines ---
    .replace(/\n{3,}/g, "\n\n")              // excessive newlines
    .trim();
}

function FormattedText({ text, T, style = {} }) {
  if (!text) return null;
  const clean = cleanText(text);
  return (
    <div style={style}>
      {clean.split(/\n+/).map((line, i) => {
        const t = line.trim();
        if (!t) return null;
        const isSection = /^[✅⚠️💡✍️📊🔍]/.test(t) || (t.endsWith(":") && t.length < 70 && !t.startsWith("-"));
        const isBullet  = /^[-•·*]\s/.test(t);
        if (isSection) return (
          <div key={i} style={{ fontWeight:700, color:T.text, marginTop:i>0?14:0, marginBottom:5, fontSize:14, borderBottom:`1px solid ${T.border}`, paddingBottom:4 }}>{t.replace(/:$/, "")}</div>
        );
        if (isBullet) return (
          <div key={i} style={{ display:"flex", gap:8, marginBottom:5, paddingLeft:2 }}>
            <span style={{ color:T.accentHi, flexShrink:0, fontSize:15, lineHeight:1.6 }}>›</span>
            <span style={{ color:T.textSub, lineHeight:1.7, fontSize:14 }}>{t.replace(/^[-•·*]\s/, "")}</span>
          </div>
        );
        return <p key={i} style={{ color:T.textSub, lineHeight:1.7, fontSize:14, marginBottom:6 }}>{t}</p>;
      })}
    </div>
  );
}

// ─── INSIGHTS CHARTS ─────────────────────────────────────────────────────────
function InsightsCharts({ jobs, profiles, darkMode }) {
  useEffect(() => {
    if (!jobs.length) return;

    // Load Chart.js from CDN if not already loaded
    const load = () => {
      const grid  = darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
      const ticks = darkMode ? "#666" : "#999";

      // Destroy any existing charts on these canvases
      ["ins-pipeline","ins-profiles","ins-worktype"].forEach(id => {
        const el = document.getElementById(id);
        if (el && el._chart) { el._chart.destroy(); el._chart = null; }
      });

      // ── Pipeline donut ──
      const pipelineEl = document.getElementById("ins-pipeline");
      if (pipelineEl) {
        const statuses  = ["New","Saved","Applied","Interview","Offer","Rejected"];
        const colors    = ["#4ade80","#fbbf24","#60a5fa","#c084fc","#f472b6","#f87171"];
        const counts    = statuses.map(s => jobs.filter(j => j.status === s).length);
        const nonZero   = statuses.map((s,i) => counts[i] > 0 ? i : -1).filter(i => i >= 0);
        pipelineEl._chart = new window.Chart(pipelineEl, {
          type: "doughnut",
          data: {
            labels: nonZero.map(i => statuses[i]),
            datasets: [{ data: nonZero.map(i => counts[i]), backgroundColor: nonZero.map(i => colors[i]), borderWidth: 0, hoverOffset: 6 }]
          },
          options: { responsive: true, maintainAspectRatio: false, cutout: "65%",
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}` } } } }
        });
      }

      // ── Profile bar ──
      const profileEl = document.getElementById("ins-profiles");
      if (profileEl) {
        profileEl._chart = new window.Chart(profileEl, {
          type: "bar",
          data: {
            labels: profiles.map(p => p.icon + " " + p.title.split(" ")[0]),
            datasets: [{
              data: profiles.map(p => jobs.filter(j => j.profileId === p.id).length),
              backgroundColor: profiles.map(p => p.color),
              borderRadius: 6, borderWidth: 0,
            }]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false }, ticks: { color: ticks, font: { size: 12 } } },
              y: { grid: { color: grid }, ticks: { color: ticks, stepSize: 1 }, beginAtZero: true }
            }
          }
        });
      }

      // ── Work type horizontal bar ──
      const wtEl = document.getElementById("ins-worktype");
      if (wtEl) {
        const wtLabels = ["Remote","Hybrid","Onsite"];
        const wtColors = ["#059669","#d97706","#4f46e5"];
        const wtCounts = wtLabels.map(wt => jobs.filter(j => j.workType === wt).length);
        wtEl._chart = new window.Chart(wtEl, {
          type: "bar",
          data: {
            labels: wtLabels,
            datasets: [{ data: wtCounts, backgroundColor: wtColors, borderRadius: 6, borderWidth: 0 }]
          },
          options: { indexAxis: "y", responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { color: grid }, ticks: { color: ticks, stepSize: 1 }, beginAtZero: true },
              y: { grid: { display: false }, ticks: { color: ticks, font: { size: 13 } } }
            }
          }
        });
      }
    };

    if (window.Chart) {
      load();
    } else {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
      script.onload = load;
      document.head.appendChild(script);
    }
  }, [jobs, profiles, darkMode]);

  return null; // canvases already rendered by parent
}

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
function LandingPage({ onAuth, darkMode, setDarkMode }) {
  const T = darkMode ? DARK : LIGHT;
  return (
    <div style={{ minHeight:"100vh", background:T.bg, color:T.text, fontFamily:"'DM Sans','Helvetica Neue',sans-serif", display:"flex", flexDirection:"column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Space+Grotesk:wght@600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        .lbtn{transition:all .18s;cursor:pointer;border:none;outline:none}
        .lbtn:hover{opacity:.88;transform:translateY(-2px)}
        @keyframes fadein{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .fade{animation:fadein .6s ease forwards}
        .fade2{animation:fadein .6s ease .15s forwards;opacity:0}
        .fade3{animation:fadein .6s ease .3s forwards;opacity:0}
      `}</style>

      {/* Nav */}
      <div style={{ padding:"18px 40px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:`1px solid ${T.border}` }}>
        <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:22, fontWeight:700 }}>
          <span style={{ color:"#4f46e5" }}>ROLE</span><span style={{ color:T.text }}>FINDR</span>
        </div>
        <div style={{ display:"flex", gap:12, alignItems:"center" }}>
          <button className="lbtn" onClick={() => setDarkMode(d => !d)}
            style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:"8px 12px", fontSize:16, color:T.textSub }}>
            {darkMode ? "☀️" : "🌙"}
          </button>
          <button className="lbtn" onClick={() => onAuth("login")}
            style={{ background:"transparent", border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 20px", fontSize:14, fontWeight:600, color:T.text }}>
            Sign In
          </button>
          <button className="lbtn" onClick={() => onAuth("signup")}
            style={{ background:"linear-gradient(135deg,#4f46e5,#7c3aed)", border:"none", borderRadius:8, padding:"9px 20px", fontSize:14, fontWeight:700, color:"#fff", boxShadow:"0 4px 14px rgba(79,70,229,.4)" }}>
            Get Started Free
          </button>
        </div>
      </div>

      {/* Hero */}
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"80px 24px 60px", textAlign:"center" }}>
        <div className="fade" style={{ display:"inline-block", background:"rgba(79,70,229,.1)", border:"1px solid rgba(79,70,229,.3)", borderRadius:20, padding:"6px 16px", fontSize:13, fontWeight:600, color:"#818cf8", marginBottom:24 }}>
          AI-Powered Job Search
        </div>
        <h1 className="fade" style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:"clamp(36px,6vw,72px)", fontWeight:700, lineHeight:1.1, maxWidth:800, marginBottom:24 }}>
          Find your next role<br /><span style={{ background:"linear-gradient(135deg,#4f46e5,#7c3aed,#06b6d4)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>faster with AI</span>
        </h1>
        <p className="fade2" style={{ fontSize:"clamp(16px,2vw,20px)", color:T.textSub, maxWidth:560, lineHeight:1.7, marginBottom:40 }}>
          Search 5 job boards at once, get AI resume rewrites tailored to each job, generate cover letters in seconds, and track every application — all in one place.
        </p>
        <div className="fade3" style={{ display:"flex", gap:14, flexWrap:"wrap", justifyContent:"center", marginBottom:48 }}>
          <button className="lbtn" onClick={() => onAuth("signup")}
            style={{ background:"linear-gradient(135deg,#4f46e5,#7c3aed)", border:"none", borderRadius:10, padding:"14px 32px", fontSize:16, fontWeight:700, color:"#fff", boxShadow:"0 6px 24px rgba(79,70,229,.4)" }}>
            Start for Free →
          </button>
          <button className="lbtn" onClick={() => onAuth("login")}
            style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:"14px 32px", fontSize:16, fontWeight:600, color:T.text }}>
            Sign In
          </button>
        </div>

        {/* Feature pills */}
        <div className="fade3" style={{ display:"flex", gap:10, flexWrap:"wrap", justifyContent:"center" }}>
          {["🔍 5 Job Boards at Once","🤖 AI Resume Rewrite","✍️ Cover Letter Generator","📅 Application Timeline","🧩 Browser Extension","📊 Multi-Profile Search"].map(f => (
            <div key={f} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:20, padding:"8px 16px", fontSize:13, fontWeight:500, color:T.textSub }}>
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div style={{ padding:"60px 24px", background:T.surface, borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}` }}>
        <div style={{ textAlign:"center", marginBottom:40 }}>
          <h2 style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:36, fontWeight:700, marginBottom:12 }}>Simple, honest pricing</h2>
          <p style={{ color:T.textSub, fontSize:16 }}>Start free. Upgrade when you're ready.</p>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:20, maxWidth:700, margin:"0 auto" }}>

          {/* Free */}
          <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:16, padding:"28px 24px" }}>
            <div style={{ fontSize:14, fontWeight:600, color:T.textMute, marginBottom:8 }}>FREE FOREVER</div>
            <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:42, fontWeight:700, marginBottom:4 }}>$0</div>
            <div style={{ color:T.textMute, fontSize:14, marginBottom:24 }}>No credit card required</div>
            {["Job search across 5 boards","Save & track applications","2 job profiles","5 free AI credits","Application timeline"].map(f => (
              <div key={f} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:10, fontSize:14, color:T.textSub }}>
                <span style={{ color:"#4ade80" }}>✓</span> {f}
              </div>
            ))}
            <button className="lbtn" onClick={() => onAuth("signup")}
              style={{ width:"100%", marginTop:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:"12px", fontSize:15, fontWeight:600, color:T.text }}>
              Get Started Free
            </button>
          </div>

          {/* Pro */}
          <div style={{ background:"linear-gradient(135deg,rgba(79,70,229,.08),rgba(124,58,237,.05))", border:`2px solid #4f46e5`, borderRadius:16, padding:"28px 24px", position:"relative" }}>
            <div style={{ position:"absolute", top:-12, left:"50%", transform:"translateX(-50%)", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"#fff", fontSize:12, fontWeight:700, padding:"4px 14px", borderRadius:12, whiteSpace:"nowrap" }}>MOST POPULAR</div>
            <div style={{ fontSize:14, fontWeight:600, color:"#818cf8", marginBottom:8 }}>PRO</div>
            <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:4 }}>
              <span style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:42, fontWeight:700 }}>$12</span>
              <span style={{ color:T.textMute, fontSize:14 }}>/month</span>
            </div>
            <div style={{ color:"#4ade80", fontSize:13, fontWeight:600, marginBottom:24 }}>or $99/year — save 31%</div>
            {["Everything in Free","Unlimited AI resume rewrites","Unlimited cover letters","Unlimited resume fit analysis","Unlimited job profiles","Priority support"].map(f => (
              <div key={f} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:10, fontSize:14, color:T.textSub }}>
                <span style={{ color:"#818cf8" }}>✓</span> {f}
              </div>
            ))}
            <button className="lbtn" onClick={() => onAuth("signup")}
              style={{ width:"100%", marginTop:20, background:"linear-gradient(135deg,#4f46e5,#7c3aed)", border:"none", borderRadius:8, padding:"12px", fontSize:15, fontWeight:700, color:"#fff", boxShadow:"0 4px 14px rgba(79,70,229,.4)" }}>
              Start Free Trial
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding:"20px 40px", textAlign:"center", fontSize:13, color:T.textMute }}>
        Rolefindr — Free to use · No credit card required · Cancel anytime
      </div>
    </div>
  );
}

// ─── AUTH MODAL ───────────────────────────────────────────────────────────────
function AuthModal({ mode, onClose, onSuccess, darkMode }) {
  const T = darkMode ? DARK : LIGHT;
  const [tab, setTab] = useState(mode); // "login" or "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async () => {
    if (!email || !password) { setError("Please fill in all fields."); return; }
    setLoading(true); setError(""); setSuccess("");
    try {
      if (tab === "signup") {
        const { error: e } = await supabase.auth.signUp({ email, password });
        if (e) throw e;
        setSuccess("✅ Check your email to confirm your account, then sign in!");
      } else {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) throw e;
        onSuccess();
      }
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setLoading(true); setError("");
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin }
    });
    if (e) { setError(e.message); setLoading(false); }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:16, padding:"32px 36px", width:"100%", maxWidth:420, position:"relative" }}>
        <button onClick={onClose} style={{ position:"absolute", top:16, right:16, background:"none", border:"none", fontSize:22, color:T.textMute, cursor:"pointer" }}>×</button>

        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:24, fontWeight:700, marginBottom:6 }}>
            <span style={{ color:"#4f46e5" }}>ROLE</span><span style={{ color:T.text }}>FINDR</span>
          </div>
          <div style={{ fontSize:14, color:T.textMute }}>
            {tab === "signup" ? "Create your free account" : "Welcome back"}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", background:T.bg, borderRadius:8, padding:4, marginBottom:24 }}>
          {["login","signup"].map(t => (
            <button key={t} onClick={() => { setTab(t); setError(""); setSuccess(""); }}
              style={{ flex:1, padding:"8px", borderRadius:6, border:"none", cursor:"pointer", fontSize:14, fontWeight:600,
                background: tab===t ? T.surface : "transparent",
                color: tab===t ? T.text : T.textMute,
                boxShadow: tab===t ? "0 1px 4px rgba(0,0,0,.15)" : "none" }}>
              {t === "login" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        {/* Google button */}
        <button onClick={handleGoogle} disabled={loading}
          style={{ width:"100%", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:"11px", fontSize:14, fontWeight:600, color:T.text, cursor:"pointer", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M47.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h13.1c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.3 7.4-10.6 7.4-17.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.9-6c-2.1 1.4-4.8 2.3-8 2.3-6.1 0-11.3-4.1-13.2-9.7H2.7v6.2C6.7 42.8 14.8 48 24 48z"/><path fill="#FBBC05" d="M10.8 28.8c-.5-1.4-.7-2.8-.7-4.3s.3-3 .7-4.3v-6.2H2.7C1 17.3 0 20.5 0 24s1 6.7 2.7 9.8l8.1-5z"/><path fill="#EA4335" d="M24 9.5c3.4 0 6.5 1.2 8.9 3.5l6.6-6.6C35.9 2.5 30.5 0 24 0 14.8 0 6.7 5.2 2.7 13l8.1 6.2c1.9-5.6 7.1-9.7 13.2-9.7z"/></svg>
          Continue with Google
        </button>

        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <div style={{ flex:1, height:1, background:T.border }} />
          <span style={{ fontSize:12, color:T.textMute }}>or</span>
          <div style={{ flex:1, height:1, background:T.border }} />
        </div>

        {/* Email & Password */}
        <div style={{ marginBottom:12 }}>
          <label style={{ fontSize:12, fontWeight:600, color:T.textMute, display:"block", marginBottom:4 }}>EMAIL</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com" onKeyDown={e => e.key==="Enter" && handleSubmit()}
            style={{ width:"100%", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:"10px 13px", color:T.text, fontSize:14, fontFamily:"inherit" }} />
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:12, fontWeight:600, color:T.textMute, display:"block", marginBottom:4 }}>PASSWORD</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••" onKeyDown={e => e.key==="Enter" && handleSubmit()}
            style={{ width:"100%", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:"10px 13px", color:T.text, fontSize:14, fontFamily:"inherit" }} />
        </div>

        {error && <div style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.3)", borderRadius:7, padding:"9px 12px", fontSize:13, color:"#f87171", marginBottom:14 }}>{error}</div>}
        {success && <div style={{ background:"rgba(74,222,128,.1)", border:"1px solid rgba(74,222,128,.3)", borderRadius:7, padding:"9px 12px", fontSize:13, color:"#4ade80", marginBottom:14 }}>{success}</div>}

        <button onClick={handleSubmit} disabled={loading}
          style={{ width:"100%", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", border:"none", borderRadius:8, padding:"12px", fontSize:15, fontWeight:700, color:"#fff", cursor:"pointer", boxShadow:"0 4px 14px rgba(79,70,229,.4)" }}>
          {loading ? "Please wait…" : tab === "login" ? "Sign In" : "Create Account"}
        </button>
      </div>
    </div>
  );
}

// ─── PAYWALL MODAL ───────────────────────────────────────────────────────────
function PaywallModal({ onClose, darkMode, userId }) {
  const T = darkMode ? DARK : LIGHT;
  const [loading, setLoading] = useState(null);
  const DB = process.env.REACT_APP_API_URL || "https://rolefindr.onrender.com";

  const checkout = async (plan) => {
    setLoading(plan);
    try {
      const r = await fetch(`${DB}/create-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, userId, returnUrl: window.location.href }),
      });
      const d = await r.json();
      if (d.url) window.location.href = d.url;
      else throw new Error("No checkout URL");
    } catch {
      alert("Could not start checkout. Please try again.");
    }
    setLoading(null);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.8)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:20, padding:"36px 32px", width:"100%", maxWidth:460, position:"relative", textAlign:"center" }}>
        <button onClick={onClose} style={{ position:"absolute", top:16, right:16, background:"none", border:"none", fontSize:22, color:T.textMute, cursor:"pointer" }}>×</button>

        <div style={{ fontSize:40, marginBottom:12 }}>⚡</div>
        <h2 style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:24, fontWeight:700, marginBottom:8, color:T.text }}>You've used your 5 free AI credits</h2>
        <p style={{ color:T.textSub, fontSize:15, lineHeight:1.6, marginBottom:28 }}>
          Upgrade to Pro for unlimited AI resume rewrites, cover letters, and resume fit analysis.
        </p>

        {/* Plans */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:24 }}>
          {/* Monthly */}
          <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:12, padding:"20px 16px" }}>
            <div style={{ fontSize:13, fontWeight:600, color:T.textMute, marginBottom:6 }}>MONTHLY</div>
            <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:32, fontWeight:700, color:T.text }}>$12</div>
            <div style={{ fontSize:13, color:T.textMute, marginBottom:16 }}>per month</div>
            <button onClick={() => checkout("monthly")} disabled={loading === "monthly"}
              style={{ width:"100%", background:T.accent, color:"#fff", border:"none", borderRadius:8, padding:"10px", fontSize:14, fontWeight:700, cursor:"pointer" }}>
              {loading === "monthly" ? "Loading…" : "Get Pro"}
            </button>
          </div>

          {/* Yearly — highlighted */}
          <div style={{ background:"linear-gradient(135deg,rgba(79,70,229,.12),rgba(124,58,237,.08))", border:`2px solid ${T.accent}`, borderRadius:12, padding:"20px 16px", position:"relative" }}>
            <div style={{ position:"absolute", top:-10, left:"50%", transform:"translateX(-50%)", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"#fff", fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:10 }}>BEST VALUE</div>
            <div style={{ fontSize:13, fontWeight:600, color:T.accentHi, marginBottom:6 }}>YEARLY</div>
            <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:32, fontWeight:700, color:T.text }}>$99</div>
            <div style={{ fontSize:13, color:T.textMute, marginBottom:16 }}>per year <span style={{ color:"#4ade80", fontWeight:600 }}>save 31%</span></div>
            <button onClick={() => checkout("yearly")} disabled={loading === "yearly"}
              style={{ width:"100%", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"#fff", border:"none", borderRadius:8, padding:"10px", fontSize:14, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 14px rgba(79,70,229,.4)" }}>
              {loading === "yearly" ? "Loading…" : "Get Pro"}
            </button>
          </div>
        </div>

        <div style={{ fontSize:13, color:T.textMute }}>
          ✅ Unlimited AI features &nbsp;·&nbsp; ✅ Unlimited profiles &nbsp;·&nbsp; ✅ Cancel anytime
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function Rolefindr() {
  // ── Theme ─────────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem("rf_theme") !== "light"; } catch { return true; }
  });
  const T = darkMode ? DARK : LIGHT;

  // ── Auth state ────────────────────────────────────────────────────────────
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showAuth, setShowAuth] = useState(null);

  // ── Subscription state ────────────────────────────────────────────────────
  const [isPro, setIsPro] = useState(false);
  const [aiUsesLeft, setAiUsesLeft] = useState(5);
  const [showPaywall, setShowPaywall] = useState(false);
  const FREE_AI_USES = 5;

  const loadSubscription = async (userId) => {
    try {
      const { data } = await supabase.from("subscriptions").select("*").eq("user_id", userId).single();
      if (data) {
        setIsPro(data.is_pro || false);
        setAiUsesLeft(Math.max(0, FREE_AI_USES - (data.ai_uses || 0)));
      } else {
        // First time user — create subscription record
        await supabase.from("subscriptions").insert({ user_id: userId, is_pro: false, ai_uses: 0 });
        setIsPro(false); setAiUsesLeft(FREE_AI_USES);
      }
    } catch { setIsPro(false); setAiUsesLeft(FREE_AI_USES); }
  };

  const consumeAiUse = async () => {
    if (isPro) return true; // Pro users unlimited
    if (aiUsesLeft <= 0) { setShowPaywall(true); return false; }
    try {
      const { data } = await supabase.from("subscriptions").select("ai_uses").eq("user_id", user.id).single();
      const newUses = (data?.ai_uses || 0) + 1;
      await supabase.from("subscriptions").update({ ai_uses: newUses }).eq("user_id", user.id);
      setAiUsesLeft(Math.max(0, FREE_AI_USES - newUses));
      if (FREE_AI_USES - newUses <= 0) setShowPaywall(true);
    } catch {}
    return true;
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthChecked(true);
      if (session?.user) loadSubscription(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) { setShowAuth(null); loadSubscription(session.user.id); }
    });
    return () => subscription.unsubscribe();
  }, []);
  // ── Core state ───────────────────────────────────────────────────────────
  const [profiles, setProfiles] = useState(() => {
    try { return JSON.parse(localStorage.getItem("rf_profiles")) || DEFAULT_PROFILES; } catch { return DEFAULT_PROFILES; }
  });
  const [jobs, setJobs] = useState([]);
  const [activeProfile, setActiveProfile] = useState("All"); // "All" or profile.id
  const [selectedJob, setSelectedJob] = useState(null);
  const [activeTab, setActiveTab] = useState("jobs");

  // ── Search state ─────────────────────────────────────────────────────────
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState("");
  const [searchError, setSearchError] = useState("");
  const [timeFilter, setTimeFilter] = useState("week");
  const [location, setLocation] = useState("Silver Spring, MD");
  const [editingLocation, setEditingLocation] = useState(false);
  const [tempLocation, setTempLocation] = useState("Silver Spring, MD");
  const [gpsLoading, setGpsLoading] = useState(false);

  // ── Filter state ─────────────────────────────────────────────────────────
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterWorkType, setFilterWorkType] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Persistent state ─────────────────────────────────────────────────────
  const [notes, setNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem("rf_notes")) || {}; } catch { return {}; }
  });
  const [statusOverrides, setStatusOverrides] = useState(() => {
    try { return JSON.parse(localStorage.getItem("rf_statuses")) || {}; } catch { return {}; }
  });

  // ── UI state ──────────────────────────────────────────────────────────────
  const [notification, setNotification] = useState(null);
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [newProfileTitle, setNewProfileTitle] = useState("");
  const [newProfileRemote, setNewProfileRemote] = useState(false);
  const [generatingProfile, setGeneratingProfile] = useState(false);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [pendingApplyJob, setPendingApplyJob] = useState(null);

  // ── Cover letter state ────────────────────────────────────────────────────
  const [coverLetter, setCoverLetter] = useState("");
  const [showCoverLetter, setShowCoverLetter] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [clHistory, setClHistory] = useState([]);
  const [clPrompt, setClPrompt] = useState("");

  // ── Resume analysis state ─────────────────────────────────────────────────
  const [resumeText, setResumeText] = useState("");
  const [analysisResult, setAnalysisResult] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [quickAnalysis, setQuickAnalysis] = useState(null); // {result, jobId}
  const [isQuickAnalyzing, setIsQuickAnalyzing] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(null);
  const [rewrittenResume, setRewrittenResume] = useState(null); // {text, jobTitle, jobId}
  const [isRewriting, setIsRewriting] = useState(false);

  // ── Job coach state ───────────────────────────────────────────────────────
  const [coachMessages, setCoachMessages] = useState([
    { role:"assistant", content:"👋 Hi! I'm your AI Job Coach. I can help with interview prep, salary negotiation, resume advice, or deciding if a job is worth applying to. What do you need?" }
  ]);
  const [coachInput, setCoachInput] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);

  // ── Timeline state ────────────────────────────────────────────────────────
  const [timeline, setTimeline] = useState({}); // { jobId: [{id,type,note,event_date,created_at}] }
  const [showTimeline, setShowTimeline] = useState(false);
  const [tlType, setTlType] = useState("Note");
  const [tlNote, setTlNote] = useState("");
  const [tlDate, setTlDate] = useState("");
  const [addingTl, setAddingTl] = useState(false);

  const TIMELINE_TYPES = ["Applied","Phone Screen","Interview","Follow Up","Offer","Rejected","Note"];
  const TL_ICONS = { Applied:"📤", "Phone Screen":"📞", Interview:"🗓️", "Follow Up":"🔔", Offer:"🎉", Rejected:"❌", Note:"📝" };

  // ── DB helpers ────────────────────────────────────────────────────────────
  const DB = process.env.REACT_APP_API_URL || "https://rolefindr.onrender.com";

  const dbHeaders = () => ({
    "Content-Type": "application/json",
    "X-User-Id": user?.id || "",
  });

  const dbPost = (path, body) => fetch(`${DB}${path}`, {
    method:"POST", headers: dbHeaders(), body:JSON.stringify({ ...body, userId: user?.id || "" })
  }).catch(() => {});

  const dbDelete = (path) => fetch(`${DB}${path}`, {
    method:"DELETE", headers: dbHeaders()
  }).catch(() => {});

  // ── Load persisted data from DB on first mount ────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const r = await fetch(`${DB}/db/jobs`, { headers: { "X-User-Id": user.id } });
        if (r.ok) {
          const d = await r.json();
          if (d.jobs?.length) {
            setJobs(sortJobs(d.jobs));
            showNotif(`📂 Loaded ${d.jobs.length} saved jobs`, "success");
          }
        }
      } catch {}
      try {
        const r = await fetch(`${DB}/db/profiles`, { headers: { "X-User-Id": user.id } });
        if (r.ok) {
          const d = await r.json();
          if (d.profiles?.length) setProfiles(d.profiles);
        }
      } catch {}
    })();
  }, [user]);

  // ── Persist to localStorage — skip first render to avoid loops ───────────
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) return;
    localStorage.setItem("rf_notes", JSON.stringify(notes));
  }, [notes]);
  useEffect(() => {
    if (!mountedRef.current) return;
    localStorage.setItem("rf_statuses", JSON.stringify(statusOverrides));
  }, [statusOverrides]);
  useEffect(() => {
    if (!mountedRef.current) return;
    localStorage.setItem("rf_profiles", JSON.stringify(profiles));
    dbPost("/db/profiles", { profiles });
  }, [profiles]);
  useEffect(() => {
    localStorage.setItem("rf_theme", darkMode ? "dark" : "light");
  }, [darkMode]);
  useEffect(() => { mountedRef.current = true; }, []);

  // Refs so async callbacks always read latest values without stale closures
  const statusOverridesRef = useRef(statusOverrides);
  useEffect(() => { statusOverridesRef.current = statusOverrides; }, [statusOverrides]);

  const profilesRef = useRef(profiles);
  useEffect(() => { profilesRef.current = profiles; }, [profiles]);

  // ─── Notification ─────────────────────────────────────────────────────────
  const showNotif = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3200);
  };

  // ─── GPS ──────────────────────────────────────────────────────────────────
  const useGPS = () => {
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
        const data = await res.json();
        const city = data.address?.city || data.address?.town || data.address?.village || "";
        const state = data.address?.state || "";
        const loc = city && state ? `${city}, ${state}` : `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
        setLocation(loc); setTempLocation(loc);
        showNotif(`📍 Location: ${loc}`);
      } catch { showNotif("Could not get location.", "error"); }
      setGpsLoading(false);
    }, () => { showNotif("Location access denied.", "error"); setGpsLoading(false); });
  };

  // ─── Add Profile ──────────────────────────────────────────────────────────
  const addProfile = async () => {
    if (!newProfileTitle.trim() || profiles.length >= 4) return;
    setGeneratingProfile(true);
    try {
      const reply = await callClaude([{ role:"user", content:
        `Generate 4 specific job title search terms for "${newProfileTitle}" jobs on LinkedIn/Indeed.
Rules: Each must be an actual job title (not a skill). Be specific and varied.
Return ONLY a JSON array, no markdown. Example: ["Title One","Title Two","Title Three","Title Four"]` }]);
      let terms;
      try { terms = JSON.parse(reply.trim()); } catch { terms = [newProfileTitle]; }
      const idx = profiles.length;
      const p = {
        id: `p${Date.now()}`,
        title: newProfileTitle,
        icon: pickIcon(newProfileTitle),
        color: PROFILE_COLORS[idx % PROFILE_COLORS.length],
        remote: newProfileRemote,
        searchTerms: terms,
        resume: "",
      };
      setProfiles(prev => [...prev, p]);
      setNewProfileTitle(""); setNewProfileRemote(false); setShowAddProfile(false);
      showNotif(`✅ Profile "${newProfileTitle}" created!`);
    } catch { showNotif("Could not create profile. Check API.", "error"); }
    setGeneratingProfile(false);
  };

  // Normalize a string for dedup comparison — strip punctuation, extra spaces, lowercase
  const normalizeKey = (title, company) => {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
    return `${clean(title)}||${clean(company)}`;
  };

  // ─── Job Search ───────────────────────────────────────────────────────────
  const fetchForProfile = async (profile, loc, tf) => {
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || "http://localhost:3002"}/search`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          search_term: profile.searchTerms[0] || profile.title,
          search_terms: profile.searchTerms.slice(1),
          location: profile.remote ? "" : loc,
          time_filter: tf,
          remote: profile.remote,
          results: 15,
        }),
      });
      const data = await res.json();
      const rawJobs = data.jobs || [];

      // Keyword filter — must match at least one keyword from this profile
      const keywords = [...new Set([
        ...profile.title.toLowerCase().split(" ").filter(w => w.length > 2),
        ...profile.searchTerms.flatMap(t => t.toLowerCase().split(" ")).filter(w => w.length > 3),
      ])];

      const relevant = rawJobs.filter(j => {
        const titleLow = j.title.toLowerCase();
        const descLow  = (j.description || "").toLowerCase().slice(0, 500);
        return keywords.some(kw => titleLow.includes(kw) || descLow.includes(kw));
      });

      const finalList = relevant.length >= 4 ? relevant : rawJobs;

      // Dedupe within this profile using normalized key
      const seen = new Set();
      const unique = finalList.filter(j => {
        const k = normalizeKey(j.title, j.company);
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });

      return unique.map(j => ({
        ...j,
        profileId: profile.id,
        type: profile.title,
        match: computeMatch(j, profile),
        status: statusOverridesRef.current[j.id] || "New",
      }));
    } catch {
      setSearchError("Cannot connect to job server. Is jobserver.py running?");
      return [];
    }
  };

  // Use a ref to hold current location/timeFilter for the search function
  // This avoids stale closure issues without needing useCallback
  const locationRef  = useRef(location);
  const timeFilterRef = useRef(timeFilter);
  useEffect(() => { locationRef.current = location; }, [location]);
  useEffect(() => { timeFilterRef.current = timeFilter; }, [timeFilter]);

  const searchJobs = async (profileIdOverride) => {
    const pid = profileIdOverride ?? activeProfile;
    const currentProfiles = profilesRef.current;
    const loc = locationRef.current;
    const tf  = timeFilterRef.current;

    setIsSearching(true); setSearchError(""); setSelectedJob(null);

    // Clear existing jobs for this search scope so list doesn't show stale results
    if (pid === "All") setJobs([]);
    else setJobs(prev => prev.filter(j => j.profileId !== pid));

    const toSearch = pid === "All" ? currentProfiles : currentProfiles.filter(p => p.id === pid);
    const globalSeen = new Set(); // track across all profiles for dedup
    let totalFound = 0;

    for (const p of toSearch) {
      setSearchProgress(`Searching ${p.icon} ${p.title}…`);
      const found = await fetchForProfile(p, loc, tf);

      // Dedupe against everything already shown
      const fresh = found.filter(j => {
        const k = normalizeKey(j.title, j.company);
        if (globalSeen.has(k)) return false;
        globalSeen.add(k); return true;
      });

      if (fresh.length > 0) {
        totalFound += fresh.length;
        // ✅ Stream into UI immediately — user sees results as each profile loads
        setJobs(prev => sortJobs([...prev, ...fresh]));
        setSearchProgress(`Found ${totalFound} so far… searching ${p.icon} ${p.title}`);
        // Persist to DB in background
        dbPost("/db/jobs", { jobs: fresh.map(j => ({ ...j, profileId: p.id })) });
      }
    }

    setIsSearching(false); setSearchProgress("");
    showNotif(totalFound > 0 ? `✅ Found ${totalFound} jobs!` : "No jobs found. Try a wider time filter.", totalFound > 0 ? "success" : "error");
  };

  // ─── Filtered view — depends on activeProfile ─────────────────────────────
  const filtered = sortJobs(jobs.filter(j => {
    if (activeProfile !== "All" && j.profileId !== activeProfile) return false;
    if (filterStatus !== "All" && j.status !== filterStatus) return false;
    if (filterWorkType !== "All" && j.workType !== filterWorkType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!j.title.toLowerCase().includes(q) && !j.company.toLowerCase().includes(q)) return false;
    }
    return true;
  }));

  const stats = {
    total: jobs.length,
    new: jobs.filter(j => j.status === "New").length,
    saved: jobs.filter(j => j.status === "Saved").length,
    applied: jobs.filter(j => j.status === "Applied").length,
    interviews: jobs.filter(j => j.status === "Interview").length,
    offers: jobs.filter(j => j.status === "Offer").length,
  };

  const profileOf = (job) => profiles.find(p => p.id === job?.profileId);

  const updateStatus = (id, status) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status } : j));
    setSelectedJob(prev => prev?.id === id ? { ...prev, status } : prev);
    setStatusOverrides(prev => ({ ...prev, [id]: status }));
    dbPost("/db/status", { id, status });
    showNotif(`Moved to ${status}`);
  };

  // ─── Apply confirmation ───────────────────────────────────────────────────
  const handleApply = (job) => {
    if (job.url && job.url !== "#") window.open(job.url, "_blank");
    setPendingApplyJob(job); setShowApplyConfirm(true);
  };
  const confirmApply = (done) => {
    if (done && pendingApplyJob) { updateStatus(pendingApplyJob.id, "Applied"); showNotif("🎉 Application logged!"); }
    setShowApplyConfirm(false); setPendingApplyJob(null);
  };

  // ─── Timeline ─────────────────────────────────────────────────────────────
  const loadTimeline = async (jobId) => {
    try {
      const r = await fetch(`${DB}/db/timeline/${jobId}`, { headers: { "X-User-Id": user?.id || "" } });
      const d = await r.json();
      setTimeline(prev => ({ ...prev, [jobId]: d.timeline || [] }));
    } catch {}
  };

  const addTimelineEvent = async (jobId) => {
    if (!tlType) return;
    setAddingTl(true);
    try {
      const r = await dbPost("/db/timeline", { jobId, type: tlType, note: tlNote, date: tlDate });
      const d = await r.json();
      setTimeline(prev => ({ ...prev, [jobId]: d.timeline || [] }));
      setTlNote(""); setTlDate("");
      showNotif(`${TL_ICONS[tlType]} ${tlType} logged!`);
    } catch { showNotif("Could not save event.", "error"); }
    setAddingTl(false);
  };

  const deleteTimelineEvent = async (jobId, eventId) => {
    await dbDelete(`/db/timeline/${eventId}`);
    setTimeline(prev => ({ ...prev, [jobId]: (prev[jobId]||[]).filter(e => e.id !== eventId) }));
  };

  // ─── Export / Import ──────────────────────────────────────────────────────
  const exportData = async () => {
    try {
      const r = await fetch(`${DB}/db/export`);
      const data = await r.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `rolefindr_backup_${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      showNotif(`📦 Exported ${data.jobs?.length || 0} jobs`);
    } catch { showNotif("Export failed — is server running?", "error"); }
  };

  const importData = async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const r = await dbPost("/db/import", data);
      const d = await r.json();
      showNotif(`✅ Imported ${d.jobs} jobs, ${d.profiles} profiles`);
      // Reload from DB
      const r2 = await fetch(`${DB}/db/jobs`);
      const d2 = await r2.json();
      if (d2.jobs?.length) setJobs(sortJobs(d2.jobs));
    } catch { showNotif("Import failed — invalid file?", "error"); }
  };

  // ─── Cover letter ─────────────────────────────────────────────────────────
  const generateCoverLetter = async (job) => {
    if (!await consumeAiUse()) return;
    setShowCoverLetter(true); setIsGenerating(true); setCoverLetter(""); setClHistory([]);
    const profile = profileOf(job);
    const resumeCtx = profile?.resume ? `\nMy resume:\n${profile.resume.slice(0,1500)}` : "";
    const system = "You are a professional cover letter writer. Never open with location references or clichés. Start with a strong hook. Sign off as [Your Name]. No asterisks.";
    const msg = `Write a cover letter. 3 tight paragraphs. Professional, specific, no filler.\nJob: ${job.title} at ${job.company}\nDescription: ${job.description}${resumeCtx}\nStart with "Dear Hiring Manager,". Output ONLY the letter.`;
    try {
      const reply = await callClaude([{ role:"user", content:msg }], system);
      setCoverLetter(reply);
      setClHistory([{ role:"user", content:msg }, { role:"assistant", content:reply }]);
    } catch { setCoverLetter("Connection error. Please try again in a moment."); }
    setIsGenerating(false);
  };

  const refineCoverLetter = async () => {
    if (!clPrompt.trim() || isGenerating) return;
    setIsGenerating(true);
    const msg = `Current letter:\n${coverLetter}\n\nChange: ${clPrompt}\n\nOutput ONLY the full updated letter.`;
    const newHist = [...clHistory, { role:"user", content:msg }];
    setClPrompt("");
    try {
      const reply = await callClaude(newHist);
      setCoverLetter(reply);
      setClHistory([...newHist, { role:"assistant", content:reply }]);
    } catch { showNotif("Connection error.", "error"); }
    setIsGenerating(false);
  };

  // ─── Resume analysis ──────────────────────────────────────────────────────
  const runQuickAnalysis = async (job) => {
    if (!await consumeAiUse()) return;
    const profile = profileOf(job);
    if (!profile?.resume) { showNotif("Add a resume to this profile in the Resume tab first.", "error"); return; }
    setIsQuickAnalyzing(true); setQuickAnalysis(null);
    try {
      const reply = await callClaude([{ role:"user", content:
        `Compare this resume to this job. Be concise. No asterisks.
Resume: ${profile.resume.slice(0,1500)}
Job: ${job.title} — ${job.description.slice(0,600)}

Format your response exactly like this:
✅ STRENGTHS
- strength one
- strength two

⚠️ GAPS
- gap one
- gap two

💡 QUICK WINS
- bullet to add to resume
- bullet to add to resume` }], "", 800);
      setQuickAnalysis({ result: reply, jobId: job.id });
    } catch { setQuickAnalysis({ result:"Analysis failed. Check connection.", jobId:job.id }); }
    setIsQuickAnalyzing(false);
  };

  const runFullAnalysis = async () => {
    if (!await consumeAiUse()) return;
    if (!selectedJob) { showNotif("Select a job from the Jobs tab first.", "error"); return; }
    // Always derive resume from the selected job's profile — never use stale resumeText
    const profile = profileOf(selectedJob);
    const resume = profile?.resume || resumeText.trim();
    if (!resume) { showNotif("Add a resume to this profile in the Resume tab first.", "error"); return; }
    // Sync text box so user can see what's being analyzed
    setResumeText(resume);
    setIsAnalyzing(true); setAnalysisResult("");
    try {
      const reply = await callClaude([{ role:"user", content:
        `You are an expert resume coach. Analyze this resume vs this job. No asterisks, no markdown bold.

Resume:
${resume.slice(0,3000)}

Job: ${selectedJob.title} at ${selectedJob.company}
Description: ${selectedJob.description}

Respond in exactly this format:

MATCH SCORE: [0-100]%
[One sentence explaining the score]

✅ STRENGTHS
- strength one
- strength two
- strength three

⚠️ TOP GAPS
- gap one
- gap two
- gap three

💡 QUICK WINS — Add to your resume:
- exact bullet to add
- exact bullet to add
- exact bullet to add

✍️ REWRITE SUGGESTION
Before: [a weak bullet from their resume]
After: [rewritten to match this job]` }], "", 1500);
      setAnalysisResult(reply);
    } catch { setAnalysisResult("Analysis failed. Check your connection."); }
    setIsAnalyzing(false);
  };

  // ─── Rewrite Resume ───────────────────────────────────────────────────────
  const rewriteResume = async (job) => {
    if (!await consumeAiUse()) return;
    const profile = profileOf(job);
    const resume = profile?.resume || resumeText.trim();
    if (!resume) { showNotif("Add a resume to this profile first.", "error"); return; }
    setIsRewriting(true); setRewrittenResume(null);
    try {
      const reply = await callClaude([{ role:"user", content:
        `You are an expert resume writer. Rewrite the resume below so it is optimized for this specific job.

INSTRUCTIONS:
- Keep all real experience, dates, companies, and education — do not fabricate anything
- Rewrite bullet points to use keywords and language from the job description
- Reorder bullets within each role to lead with the most relevant experience
- Adjust the summary/objective section to speak directly to this role
- Add any missing keywords naturally where they genuinely apply
- Keep the same overall structure and sections
- Output ONLY the full rewritten resume text, clean and ready to copy — no commentary, no markdown, no asterisks

JOB: ${job.title} at ${job.company}
JOB DESCRIPTION:
${job.description}

ORIGINAL RESUME:
${resume}` }], "", 2000);
      setRewrittenResume({ text: reply, jobTitle: job.title, company: job.company, jobId: job.id });
      showNotif("✅ Resume rewritten! Ready to download.");
    } catch { showNotif("Rewrite failed. Check connection.", "error"); }
    setIsRewriting(false);
  };

  const downloadResume = async (text, jobTitle, company) => {
    const filename = `Resume_${jobTitle}_${company}`.replace(/[^a-z0-9]/gi, "_").slice(0, 50) + ".docx";

    const lines = text.split("\n");
    const children = [];

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();

      // Blank line spacer
      if (!line.trim()) {
        children.push(new Paragraph({ children: [new TextRun("")], spacing: { before: 80, after: 80 } }));
        continue;
      }

      const trimmed = line.trim();
      const isHeader =
        (trimmed === trimmed.toUpperCase() && trimmed.length > 2 && !/^[-•·*]/.test(trimmed)) ||
        (trimmed.endsWith(":") && trimmed.length < 55 && !/^[-•·*]/.test(trimmed));
      const isBullet = /^\s*[-•·*]\s/.test(line);
      const isDateLine = /\d{4}/.test(trimmed) && trimmed.length < 80 && !isHeader;
      const cleanText = trimmed.replace(/^[-•·*]\s/, "").replace(/:$/, "");

      if (isHeader) {
        children.push(new Paragraph({
          children: [new TextRun({ text: cleanText, bold: true, size: 24, font: "Calibri", color: "2E4057" })],
          spacing: { before: 280, after: 80 },
          border: { bottom: { style: "single", size: 8, color: "4F46E5", space: 4 } },
        }));
      } else if (isBullet) {
        children.push(new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          children: [new TextRun({ text: cleanText, size: 22, font: "Calibri" })],
          spacing: { before: 40, after: 40 },
        }));
      } else if (isDateLine) {
        children.push(new Paragraph({
          children: [new TextRun({ text: cleanText, bold: true, size: 22, font: "Calibri" })],
          spacing: { before: 80, after: 20 },
        }));
      } else {
        children.push(new Paragraph({
          children: [new TextRun({ text: cleanText, size: 22, font: "Calibri" })],
          spacing: { before: 40, after: 40 },
        }));
      }
    }

    const doc = new Document({
      numbering: {
        config: [{
          reference: "bullets",
          levels: [{
            level: 0,
            format: LevelFormat.BULLET,
            text: "\u2022",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        }],
      },
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        children,
      }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotif("📄 Word document downloaded!");
  };

  const handleResumeUpload = async (file, profileId) => {
    setUploadingResume(profileId);
    try {
      const text = await parseResumeFile(file);
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, resume:text } : p));
      if (selectedJob?.profileId === profileId) setResumeText(text);
      setJobs(prev => prev.map(j => {
        if (j.profileId !== profileId) return j;
        const p = profilesRef.current.find(pr => pr.id === profileId);
        return p ? { ...j, match: computeMatch(j, { ...p, resume:text }) } : j;
      }));
      showNotif(`✅ Resume uploaded!`);
    } catch (e) { showNotif(`Upload failed: ${e.message}`, "error"); }
    setUploadingResume(null);
  };

  // ─── Job Coach ────────────────────────────────────────────────────────────
  const sendCoachMessage = async () => {
    if (!coachInput.trim() || coachLoading) return;
    const msg = coachInput.trim(); setCoachInput("");
    const newMsgs = [...coachMessages, { role:"user", content:msg }];
    setCoachMessages(newMsgs); setCoachLoading(true);
    try {
      const ctx = selectedJob ? `Context: user is looking at ${selectedJob.title} at ${selectedJob.company}.` : "";
      const reply = await callClaude(
        newMsgs.map(m => ({ role:m.role, content:m.content })),
        `You are an expert AI job coach. Be concise, practical, encouraging. ${ctx}`, 600
      );
      setCoachMessages(prev => [...prev, { role:"assistant", content:reply }]);
    } catch { setCoachMessages(prev => [...prev, { role:"assistant", content:"Connection error. Try again." }]); }
    setCoachLoading(false);
  };

  // ─── Score display helper ─────────────────────────────────────────────────
  const getScoreFromAnalysis = (text) => {
    const m = text?.match(/MATCH SCORE:\s*(\d+)%/);
    return m ? parseInt(m[1]) : null;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  // Loading auth state
  if (!authChecked) return (
    <div style={{ minHeight:"100vh", background:DARK.bg, display:"flex", alignItems:"center", justifyContent:"center", color:"#818cf8", fontFamily:"'DM Sans',sans-serif", fontSize:16 }}>
      <span style={{ animation:"pulse 1s infinite" }}>⚡</span>&nbsp; Loading Rolefindr…
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
    </div>
  );

  // Not logged in — show landing page
  if (!user) return (
    <>
      <LandingPage onAuth={mode => setShowAuth(mode)} darkMode={darkMode} setDarkMode={setDarkMode} />
      {showAuth && <AuthModal mode={showAuth} darkMode={darkMode} onClose={() => setShowAuth(null)} onSuccess={() => setShowAuth(null)} />}
    </>
  );

  // Check for Stripe success redirect
  if (window.location.search.includes("checkout=success")) {
    loadSubscription(user.id);
    window.history.replaceState({}, "", window.location.pathname);
    showNotif("🎉 Welcome to Pro! All AI features are now unlimited.");
  }

  return (
    <div style={{ fontFamily:"'DM Sans','Helvetica Neue',sans-serif", background:T.bg, minHeight:"100vh", color:T.text, display:"flex", flexDirection:"column", fontSize:15 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Space+Grotesk:wght@600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:6px}
        ::-webkit-scrollbar-track{background:${T.bg}}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}
        .jcard{transition:background .13s,border-color .13s,transform .13s;cursor:pointer;border:1px solid ${T.border};border-radius:9px;padding:12px 14px;margin-bottom:6px}
        .jcard:hover{background:${T.surfaceHi}!important;border-color:#5855d6!important;transform:translateX(2px)}
        .jcard.sel{background:${T.surfaceHi}!important;border-color:${T.accent}!important}
        .pill{transition:all .14s;cursor:pointer;border:none;outline:none}
        .pill:hover{opacity:.85}
        .btn{transition:all .15s;cursor:pointer;border:none;outline:none}
        .btn:hover{opacity:.85;transform:translateY(-1px)}
        .btn:disabled{opacity:.4;cursor:not-allowed;transform:none}
        .tab{cursor:pointer;border:none;outline:none;background:none;transition:color .14s}
        input,select,textarea{outline:none;font-family:inherit}
        input::placeholder,textarea::placeholder{color:${T.textMute}}
        a{text-decoration:none}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes fadein{from{opacity:0}to{opacity:1}}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @keyframes slideup{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .fade{animation:fadein .25s ease}
        .scanbar{background:linear-gradient(90deg,#4f46e5,#7c3aed,#06b6d4,#4f46e5);background-size:200% 100%;animation:shimmer 1.4s linear infinite}
        .modal{animation:slideup .22s ease}
      `}</style>

      {/* NOTIFICATION */}
      {notification && (
        <div className="fade" style={{ position:"fixed", top:16, right:16, zIndex:9999, padding:"11px 18px", borderRadius:9, fontSize:14, fontWeight:500, boxShadow:"0 8px 28px rgba(0,0,0,.5)",
          background:notification.type==="error"?"#2a1515":"#152a1e",
          border:`1px solid ${notification.type==="error"?"#ef4444":"#22c55e"}`,
          color:notification.type==="error"?"#fca5a5":"#86efac" }}>
          {notification.msg}
        </div>
      )}

      {/* PAYWALL MODAL */}
      {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} darkMode={darkMode} userId={user?.id} />}

      {/* APPLY MODAL */}
      {showApplyConfirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", zIndex:9998, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div className="modal" style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:"28px 32px", maxWidth:420, width:"90%", textAlign:"center" }}>
            <div style={{ fontSize:36, marginBottom:12 }}>📝</div>
            <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:18, fontWeight:700, marginBottom:8 }}>Did you complete the application?</div>
            <div style={{ fontSize:14, color:T.textSub, marginBottom:22, lineHeight:1.6 }}>
              We opened the job page for <strong style={{ color:T.text }}>{pendingApplyJob?.title}</strong> at <strong style={{ color:T.text }}>{pendingApplyJob?.company}</strong>.
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button className="btn" onClick={() => confirmApply(true)} style={{ flex:1, background:"#16a34a", color:"#fff", padding:"11px", borderRadius:8, fontSize:14, fontWeight:700 }}>✅ Yes, I applied!</button>
              <button className="btn" onClick={() => confirmApply(false)} style={{ flex:1, background:T.bg, color:T.textSub, border:`1px solid ${T.border}`, padding:"11px", borderRadius:8, fontSize:14, fontWeight:600 }}>Not yet</button>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{ padding:"12px 22px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:`1px solid ${T.border}`, background:T.surface, flexWrap:"wrap", gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:20, fontWeight:700 }}>
            <span style={{ color:T.accentHi }}>ROLE</span><span style={{ color:T.text }}>FINDR</span>
          </div>
          <div style={{ width:1, height:20, background:T.border }} />
          {/* Location */}
          {editingLocation ? (
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <input value={tempLocation} onChange={e => setTempLocation(e.target.value)}
                onKeyDown={e => { if (e.key==="Enter") { setLocation(tempLocation); setEditingLocation(false); } if (e.key==="Escape") setEditingLocation(false); }}
                autoFocus style={{ background:T.bg, border:`1px solid ${T.accentHi}`, borderRadius:7, padding:"5px 11px", color:T.text, fontSize:14, width:210 }} />
              <button onClick={useGPS} disabled={gpsLoading} className="btn" style={{ background:"rgba(99,102,241,.15)", border:`1px solid ${T.border}`, borderRadius:6, padding:"5px 10px", color:T.accentHi, fontSize:13 }}>
                {gpsLoading ? "…" : "📍 GPS"}
              </button>
              <button className="btn" onClick={() => { setLocation(tempLocation); setEditingLocation(false); }} style={{ background:T.accent, color:"#fff", borderRadius:6, padding:"5px 12px", fontSize:13, fontWeight:600 }}>Save</button>
              <button onClick={() => setEditingLocation(false)} style={{ background:"none", border:"none", color:T.textMute, cursor:"pointer", fontSize:18 }}>×</button>
            </div>
          ) : (
            <button className="btn" onClick={() => { setTempLocation(location); setEditingLocation(true); }}
              style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:6, color:T.textSub, fontSize:13, display:"flex", alignItems:"center", gap:5, padding:"4px 10px" }}>
              📍 {location} <span style={{ color:T.textMute, fontSize:11 }}>✎</span>
            </button>
          )}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
          <select value={timeFilter} onChange={e => {
            const val = e.target.value;
            setTimeFilter(val);
            timeFilterRef.current = val;
            if (jobs.length > 0) searchJobs(activeProfile);
          }} style={{
            background:T.surface, border:`1px solid ${T.border}`, borderRadius:8,
            padding:"8px 12px", color:T.text, fontSize:14, fontWeight:500,
            cursor:"pointer", appearance:"auto",
          }}>
            {TIME_FILTERS.map(tf => (
              <option key={tf.value} value={tf.value}>📅 {tf.label}</option>
            ))}
          </select>
          <button className="btn" disabled={isSearching} onClick={() => searchJobs(activeProfile)} style={{
            background:isSearching ? T.surface : "linear-gradient(135deg,#4f46e5,#7c3aed)",
            color:"#fff", padding:"9px 20px", borderRadius:8, fontSize:14, fontWeight:600,
            display:"flex", alignItems:"center", gap:7,
            boxShadow:isSearching ? "none" : "0 4px 16px rgba(79,70,229,.4)",
            border:isSearching ? `1px solid ${T.border}` : "none",
          }}>
            {isSearching ? <><span style={{ animation:"pulse 1s infinite" }}>⚡</span>{searchProgress || "Searching…"}</> : "⚡ Search Jobs"}
          </button>
          <button className="btn" onClick={exportData} title="Export all data as JSON backup"
            style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 13px", fontSize:15, color:T.textSub }}>📦</button>
          <label title="Import backup JSON" style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 13px", fontSize:15, color:T.textSub, cursor:"pointer" }}>
            📂<input type="file" accept=".json" style={{ display:"none" }} onChange={e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value=""; }} />
          </label>
          <button className="btn" onClick={() => setDarkMode(d => !d)} title="Toggle light/dark mode" style={{
            background:T.surface, border:`1px solid ${T.border}`, borderRadius:8,
            padding:"9px 13px", fontSize:17, cursor:"pointer", color:T.textSub,
          }}>{darkMode ? "☀️" : "🌙"}</button>
          <div style={{ display:"flex", alignItems:"center", gap:8, background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:"6px 12px" }}>
            {!isPro && (
              <div title="Free AI credits remaining — click to upgrade" onClick={() => setShowPaywall(true)}
                style={{ display:"flex", alignItems:"center", gap:6, background: aiUsesLeft > 0 ? "linear-gradient(135deg,rgba(79,70,229,.2),rgba(99,102,241,.15))" : "rgba(239,68,68,.15)",
                  color: aiUsesLeft > 0 ? "#818cf8" : "#f87171",
                  border: `1px solid ${aiUsesLeft > 0 ? "rgba(79,70,229,.4)" : "rgba(239,68,68,.4)"}`,
                  borderRadius:8, padding:"6px 12px", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                <span style={{ fontSize:15 }}>⚡</span>
                <span>{aiUsesLeft} free AI {aiUsesLeft === 1 ? "use" : "uses"} left</span>
                {aiUsesLeft <= 2 && <span style={{ background:"#f87171", color:"#fff", borderRadius:4, padding:"1px 6px", fontSize:11 }}>Upgrade</span>}
              </div>
            )}
            {isPro && (
              <div style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(74,222,128,.15)", color:"#4ade80", border:"1px solid rgba(74,222,128,.3)", borderRadius:8, padding:"6px 12px", fontSize:13, fontWeight:700 }}>
                ✨ Pro — Unlimited AI
              </div>
            )}
            <div style={{ width:28, height:28, borderRadius:"50%", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#fff", flexShrink:0 }}>
              {user?.email?.[0]?.toUpperCase() || "U"}
            </div>
            <span style={{ fontSize:12, color:T.textSub, maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user?.email}</span>
            <button className="btn" onClick={() => supabase.auth.signOut()}
              style={{ background:"rgba(239,68,68,.1)", color:"#f87171", border:"1px solid rgba(239,68,68,.2)", borderRadius:6, padding:"4px 10px", fontSize:12, fontWeight:600 }}>
              Sign out
            </button>
          </div>
        </div>
      </div>

      {isSearching && (
        <div style={{ background:"linear-gradient(135deg,rgba(79,70,229,.08),rgba(99,102,241,.05))", borderBottom:`1px solid rgba(79,70,229,.2)`, padding:"10px 22px", display:"flex", alignItems:"center", gap:12 }}>
          <div className="scanbar" style={{ width:32, height:3, borderRadius:2, flexShrink:0 }} />
          <div style={{ fontSize:13, color:T.accentHi, fontWeight:500 }}>
            {searchProgress || "Searching jobs…"}
          </div>
          <div style={{ fontSize:12, color:T.textMute, marginLeft:"auto" }}>
            Searching multiple job boards — this takes 30–60 seconds
          </div>
        </div>
      )}
      {searchError && (
        <div style={{ background:"#2a1e0a", borderBottom:`1px solid #78350f`, color:"#fcd34d", padding:"9px 22px", fontSize:13 }}>
          ⚠️ {searchError}
        </div>
      )}

      {/* ── STATS ── */}
      <div style={{ display:"flex", borderBottom:`1px solid ${T.border}`, background:T.surface }}>
        {[["Total",stats.total,"#818cf8","All"],["New",stats.new,"#4ade80","New"],["Saved",stats.saved,"#fbbf24","Saved"],["Applied",stats.applied,"#60a5fa","Applied"],["Interviews",stats.interviews,"#c084fc","Interview"],["Offers 🎉",stats.offers,"#f472b6","Offer"]].map(([label,value,color,status],i,arr) => {
          const active = filterStatus === status || (status === "All" && filterStatus === "All");
          return (
            <div key={label} className="btn" onClick={() => { setFilterStatus(status); setActiveTab("jobs"); }} style={{
              flex:1, padding:"11px 14px", borderRight:i<arr.length-1?`1px solid ${T.border}`:"none",
              cursor:"pointer", background: active ? `${color}18` : "transparent",
              borderBottom: active ? `2px solid ${color}` : "2px solid transparent",
              transition:"background .15s",
            }}>
              <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:22, fontWeight:700, color, lineHeight:1 }}>{value}</div>
              <div style={{ fontSize:11, color: active ? color : T.textMute, marginTop:3, fontWeight: active ? 600 : 400 }}>{label}</div>
            </div>
          );
        })}
      </div>

      {/* ── TABS ── */}
      <div style={{ display:"flex", borderBottom:`1px solid ${T.border}`, background:T.surface }}>
        {[["jobs","🗂 Jobs"],["resume","📄 Resume"],["coach","🤖 Job Coach"],["insights","📈 Insights"]].map(([id,label]) => (
          <button key={id} className="tab" onClick={() => setActiveTab(id)} style={{
            color:activeTab===id ? T.text : T.textMute, fontSize:13, fontWeight:500, padding:"11px 18px",
            borderBottom:activeTab===id ? `2px solid ${T.accent}` : "2px solid transparent",
          }}>{label}</button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          JOBS TAB
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab==="jobs" && (
        <div style={{ display:"flex", flex:1, overflow:"hidden", height:"calc(100vh - 190px)" }}>

          {/* ── LEFT PANEL ── */}
          <div style={{ width:390, flexShrink:0, display:"flex", flexDirection:"column", borderRight:`1px solid ${T.border}` }}>

            {/* Profile pills */}
            <div style={{ padding:"10px 12px", borderBottom:`1px solid ${T.border}`, background:T.surface }}>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom: showAddProfile ? 10 : 0 }}>

                {/* All pill */}
                <button className="pill" onClick={() => setActiveProfile("All")} style={{
                  padding:"5px 14px", borderRadius:20, fontSize:13, fontWeight:500,
                  background:activeProfile==="All" ? T.accent : "transparent",
                  color:activeProfile==="All" ? "#fff" : T.textSub,
                  border:`1px solid ${activeProfile==="All" ? T.accent : T.border}`,
                }}>All ({jobs.length})</button>

                {/* Per-profile pills */}
                {profiles.map(p => (
                  <div key={p.id} style={{ display:"flex", alignItems:"center", gap:2 }}>
                    <button className="pill" onClick={() => setActiveProfile(p.id)} style={{
                      padding:"5px 12px", borderRadius:20, fontSize:13, fontWeight:500,
                      background:activeProfile===p.id ? p.color+"28" : "transparent",
                      color:activeProfile===p.id ? p.color : T.textSub,
                      border:`1px solid ${activeProfile===p.id ? p.color+"90" : T.border}`,
                      display:"flex", alignItems:"center", gap:5,
                    }}>
                      {p.icon} {p.title} ({jobs.filter(j => j.profileId===p.id).length})
                    </button>
                    {profiles.length > 1 && (
                      <button onClick={() => { setProfiles(prev => prev.filter(pr => pr.id!==p.id)); if (activeProfile===p.id) setActiveProfile("All"); }}
                        style={{ background:"none", border:"none", color:T.textMute, cursor:"pointer", fontSize:15, padding:"0 2px" }}>×</button>
                    )}
                  </div>
                ))}

                {profiles.length < 4 && (
                  <button className="pill" onClick={() => setShowAddProfile(!showAddProfile)} style={{
                    padding:"5px 12px", borderRadius:20, fontSize:13, fontWeight:500,
                    background:"transparent", color:T.accentHi, border:`1px dashed ${T.accentHi}`,
                  }}>+ Add</button>
                )}
              </div>

              {/* Add profile form */}
              {showAddProfile && (
                <div className="fade" style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:"12px 14px", marginTop:8 }}>
                  <div style={{ fontSize:13, color:T.textSub, marginBottom:8, fontWeight:600 }}>New Profile</div>
                  <input value={newProfileTitle} onChange={e => setNewProfileTitle(e.target.value)}
                    onKeyDown={e => e.key==="Enter" && addProfile()}
                    placeholder="e.g. UX Designer, Data Analyst, Nurse…"
                    style={{ width:"100%", background:T.surface, border:`1px solid ${T.border}`, borderRadius:7, padding:"8px 11px", color:T.text, fontSize:14, marginBottom:8 }} />
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, color:T.textSub, cursor:"pointer" }}>
                      <input type="checkbox" checked={newProfileRemote} onChange={e => setNewProfileRemote(e.target.checked)} /> Remote only
                    </label>
                    <button className="btn" onClick={addProfile} disabled={!newProfileTitle.trim() || generatingProfile} style={{
                      marginLeft:"auto", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"#fff",
                      padding:"7px 16px", borderRadius:7, fontSize:13, fontWeight:600,
                    }}>{generatingProfile ? "Creating…" : "Create ✨"}</button>
                    <button onClick={() => setShowAddProfile(false)} style={{ background:"none", border:"none", color:T.textMute, cursor:"pointer", fontSize:13 }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>

            {/* Filters */}
            <div style={{ padding:"8px 12px", display:"flex", gap:6, borderBottom:`1px solid ${T.border}`, background:T.surface, flexWrap:"wrap" }}>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search title, company…"
                style={{ flex:1, minWidth:70, background:T.bg, border:`1px solid ${T.border}`, borderRadius:7, padding:"7px 11px", color:T.text, fontSize:13 }} />
              <select value={filterWorkType} onChange={e => setFilterWorkType(e.target.value)}
                style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:7, padding:"7px 7px", color:T.textSub, cursor:"pointer", fontSize:13 }}>
                <option value="All">Type</option><option>Remote</option><option>Hybrid</option><option>Onsite</option>
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:7, padding:"7px 7px", color:T.textSub, cursor:"pointer", fontSize:13 }}>
                <option value="All">Status</option>{STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ padding:"5px 12px 3px", fontSize:12, color:T.textMute }}>
              {filtered.length} jobs {activeProfile !== "All" ? `· ${profiles.find(p=>p.id===activeProfile)?.title}` : "· all profiles"}
            </div>

            {/* Empty state */}
            {jobs.length === 0 && !isSearching && (
              <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
                <div style={{ fontSize:44, marginBottom:14, opacity:.2 }}>🔍</div>
                <div style={{ fontSize:15, color:T.textSub, marginBottom:8 }}>No jobs loaded yet</div>
                <div style={{ fontSize:13, color:T.textMute, textAlign:"center", lineHeight:1.7 }}>Click <span style={{ color:T.accentHi, fontWeight:600 }}>⚡ Search Jobs</span> to pull live listings</div>
              </div>
            )}

            {/* Job list */}
            <div style={{ flex:1, overflowY:"auto", padding:"6px 8px 12px" }}>
              {filtered.map(job => {
                const p = profileOf(job);
                return (
                  <div key={job.id} className={`jcard ${selectedJob?.id===job.id ? "sel" : ""}`}
                    onClick={() => {
                      setSelectedJob(job);
                      setShowCoverLetter(false);
                      setCoverLetter("");
                      setQuickAnalysis(null);
                      setAnalysisResult("");
                      setRewrittenResume(null);
                      setShowTimeline(false);
                      // Always load THIS job's profile resume — never carry over another profile's
                      const jobProfile = profilesRef.current.find(pr => pr.id === job.profileId);
                      setResumeText(jobProfile?.resume || "");
                      // Load timeline for this job
                      loadTimeline(job.id);
                    }}
                    style={{ background:T.surface }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:7 }}>
                      <div style={{ flex:1, paddingRight:8 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:T.text, lineHeight:1.3 }}>{job.title}</div>
                        <div style={{ fontSize:13, color:T.textSub, marginTop:2 }}>{job.company}</div>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3, flexShrink:0 }}>
                        <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:13, fontWeight:700,
                          color:job.match>=85?"#4ade80":job.match>=70?"#fbbf24":T.textSub }}>{job.match}%</div>
                        <div style={{ fontSize:14 }}>{p?.icon || "💼"}</div>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap", alignItems:"center" }}>
                      <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:10,
                        background:WORK_TYPE_CONFIG[job.workType]?.bg || T.border,
                        color:WORK_TYPE_CONFIG[job.workType]?.color || T.textSub }}>{job.workType||"Onsite"}</span>
                      <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:10,
                        background:STATUS_CONFIG[job.status]?.bg, color:STATUS_CONFIG[job.status]?.color }}>{job.status}</span>
                      <span style={{ fontSize:12, color:T.textMute }}>·</span>
                      <span style={{ fontSize:12, color:T.textSub }}>{job.source}</span>
                      {job.postedLabel && <>
                        <span style={{ fontSize:12, color:T.textMute }}>·</span>
                        <span style={{ fontSize:12, color:job.daysAgo===0?"#4ade80":T.textSub }}>{job.postedLabel}</span>
                      </>}
                      {job.salary && job.salary!=="Not listed" &&
                        <span style={{ marginLeft:"auto", fontSize:12, color:salaryColor(job.salaryMax, T.textSub), fontWeight:600 }}>{job.salary}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── RIGHT PANEL ── */}
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>
            {selectedJob ? (
              <>
                {/* Job header */}
                <div style={{ padding:"18px 26px 14px", borderBottom:`1px solid ${T.border}`, background:T.surface }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                    <div style={{ display:"flex", gap:12, alignItems:"flex-start", flex:1 }}>
                      <div style={{ fontSize:28, lineHeight:1, flexShrink:0 }}>{profileOf(selectedJob)?.icon || "💼"}</div>
                      <div>
                        <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:19, fontWeight:700, lineHeight:1.2 }}>{selectedJob.title}</div>
                        <div style={{ fontSize:14, color:T.textSub, marginTop:4 }}>{selectedJob.company} · {selectedJob.location}</div>
                      </div>
                    </div>
                    <div style={{ textAlign:"center", padding:"9px 16px", borderRadius:10, flexShrink:0,
                      background:selectedJob.match>=80?"rgba(74,222,128,.1)":"rgba(251,191,36,.1)",
                      border:`2px solid ${selectedJob.match>=80?"rgba(74,222,128,.35)":"rgba(251,191,36,.35)"}`}}>
                      <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:24, fontWeight:700,
                        color:selectedJob.match>=80?"#4ade80":"#fbbf24", lineHeight:1 }}>{selectedJob.match}%</div>
                      <div style={{ fontSize:11, color:T.textMute, marginTop:2 }}>match</div>
                    </div>
                  </div>

                  {/* Tags */}
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    <span style={{ background:WORK_TYPE_CONFIG[selectedJob.workType]?.bg||T.border, color:WORK_TYPE_CONFIG[selectedJob.workType]?.color||T.textSub, borderRadius:20, padding:"4px 12px", fontSize:13, fontWeight:700 }}>{selectedJob.workType||"Onsite"}</span>
                    {selectedJob.salary && selectedJob.salary!=="Not listed" &&
                      <span style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:20, padding:"4px 12px", fontSize:13, color:salaryColor(selectedJob.salaryMax, T.textSub), fontWeight:600 }}>💰 {selectedJob.salary}</span>}
                    <span style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:20, padding:"4px 12px", fontSize:13, color:T.accentHi }}>📋 {selectedJob.source}</span>
                    {selectedJob.postedLabel &&
                      <span style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:20, padding:"4px 12px", fontSize:13, color:selectedJob.daysAgo===0?"#4ade80":T.textSub }}>
                        🗓 {selectedJob.postedLabel}
                      </span>}
                  </div>
                </div>

                {/* Status bar */}
                <div style={{ padding:"9px 26px", borderBottom:`1px solid ${T.border}`, display:"flex", gap:5, alignItems:"center", flexWrap:"wrap", background:T.surface }}>
                  <span style={{ fontSize:12, color:T.textMute, marginRight:3 }}>Status:</span>
                  {STATUSES.map(s => (
                    <button key={s} className="btn" onClick={() => updateStatus(selectedJob.id, s)} style={{
                      padding:"4px 11px", borderRadius:20, fontSize:12, fontWeight:600,
                      background:selectedJob.status===s ? STATUS_CONFIG[s].bg : "transparent",
                      color:selectedJob.status===s ? STATUS_CONFIG[s].color : T.textSub,
                      border:`1px solid ${selectedJob.status===s ? STATUS_CONFIG[s].border : T.border}`,
                    }}>{s}</button>
                  ))}
                </div>

                {/* Scrollable body */}
                <div style={{ flex:1, overflowY:"auto", padding:"18px 26px" }}>

                  {/* Action buttons */}
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:18 }}>
                    <button className="btn" onClick={() => generateCoverLetter(selectedJob)} style={{ background:"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"#fff", padding:"9px 18px", borderRadius:8, fontSize:14, fontWeight:600, boxShadow:"0 4px 14px rgba(79,70,229,.4)" }}>✍️ Cover Letter</button>
                    <button className="btn" onClick={() => runQuickAnalysis(selectedJob)} style={{ background:"rgba(56,189,248,.12)", color:"#38bdf8", border:"1px solid rgba(56,189,248,.3)", padding:"9px 18px", borderRadius:8, fontSize:14, fontWeight:600 }}>🔍 Resume Fit</button>
                    <button className="btn" onClick={() => handleApply(selectedJob)} style={{ background:"rgba(74,222,128,.12)", color:"#4ade80", border:"1px solid rgba(74,222,128,.3)", padding:"9px 18px", borderRadius:8, fontSize:14, fontWeight:600 }}>🔗 Apply Now</button>
                    <button className="btn" onClick={() => updateStatus(selectedJob.id,"Saved")} style={{ background:"rgba(251,191,36,.1)", color:"#fbbf24", border:"1px solid rgba(251,191,36,.25)", padding:"9px 18px", borderRadius:8, fontSize:14, fontWeight:600 }}>🔖 Save</button>
                    <button className="btn" onClick={() => setShowTimeline(t => !t)} style={{ background: showTimeline ? "rgba(167,139,250,.2)" : "rgba(167,139,250,.1)", color:"#a78bfa", border:"1px solid rgba(167,139,250,.3)", padding:"9px 18px", borderRadius:8, fontSize:14, fontWeight:600 }}>📅 Timeline</button>
                    <button className="btn" onClick={() => updateStatus(selectedJob.id,"Rejected")} style={{ background:"rgba(239,68,68,.1)", color:"#f87171", border:"1px solid rgba(239,68,68,.25)", padding:"9px 18px", borderRadius:8, fontSize:14, fontWeight:600 }}>✕ Pass</button>
                  </div>

                  {/* Timeline panel */}
                  {showTimeline && (
                    <div className="fade" style={{ background:T.surface, border:`1px solid rgba(167,139,250,.3)`, borderRadius:10, padding:"16px 18px", marginBottom:18 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:"#a78bfa", marginBottom:12 }}>📅 Application Timeline</div>

                      {/* Existing events */}
                      {(timeline[selectedJob.id]||[]).length === 0 && (
                        <div style={{ color:T.textMute, fontSize:13, marginBottom:12 }}>No events yet — log your first one below.</div>
                      )}
                      <div style={{ marginBottom:12 }}>
                        {(timeline[selectedJob.id]||[]).map(ev => (
                          <div key={ev.id} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"8px 0", borderBottom:`1px solid ${T.border}` }}>
                            <span style={{ fontSize:18, flexShrink:0 }}>{TL_ICONS[ev.type] || "📝"}</span>
                            <div style={{ flex:1 }}>
                              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                                <span style={{ fontSize:13, fontWeight:600, color:T.text }}>{ev.type}</span>
                                {ev.event_date && <span style={{ fontSize:12, color:T.textMute }}>{ev.event_date}</span>}
                              </div>
                              {ev.note && <div style={{ fontSize:13, color:T.textSub, marginTop:2 }}>{ev.note}</div>}
                              <div style={{ fontSize:11, color:T.textMute, marginTop:2 }}>{ev.created_at?.slice(0,16).replace("T"," ")}</div>
                            </div>
                            <button onClick={() => deleteTimelineEvent(selectedJob.id, ev.id)}
                              style={{ background:"none", border:"none", color:T.textMute, cursor:"pointer", fontSize:16, padding:"0 4px" }}>×</button>
                          </div>
                        ))}
                      </div>

                      {/* Add event form */}
                      <div style={{ display:"flex", gap:7, flexWrap:"wrap", alignItems:"flex-end" }}>
                        <select value={tlType} onChange={e => setTlType(e.target.value)}
                          style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:6, padding:"7px 10px", color:T.text, fontSize:13, fontFamily:"inherit" }}>
                          {TIMELINE_TYPES.map(t => <option key={t} value={t}>{TL_ICONS[t]} {t}</option>)}
                        </select>
                        <input type="date" value={tlDate} onChange={e => setTlDate(e.target.value)}
                          style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:6, padding:"7px 10px", color:T.text, fontSize:13, fontFamily:"inherit" }} />
                        <input placeholder="Optional note…" value={tlNote} onChange={e => setTlNote(e.target.value)}
                          style={{ flex:1, minWidth:120, background:T.bg, border:`1px solid ${T.border}`, borderRadius:6, padding:"7px 10px", color:T.text, fontSize:13, fontFamily:"inherit" }} />
                        <button className="btn" onClick={() => addTimelineEvent(selectedJob.id)} disabled={addingTl}
                          style={{ background:"#7c3aed", color:"#fff", padding:"7px 14px", borderRadius:6, fontSize:13, fontWeight:600 }}>
                          {addingTl ? "…" : "+ Log"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Cover letter panel */}
                  {showCoverLetter && (
                    <div className="fade" style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:"16px 18px", marginBottom:18 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:T.textSub }}>✍️ Cover Letter</div>
                        <div style={{ display:"flex", gap:6 }}>
                          {!isGenerating && coverLetter && (<>
                            <button className="btn" onClick={() => { navigator.clipboard.writeText(coverLetter); showNotif("📋 Copied!"); }}
                              style={{ background:"rgba(74,222,128,.1)", color:"#4ade80", border:"1px solid rgba(74,222,128,.25)", padding:"4px 12px", borderRadius:6, fontSize:13, fontWeight:600 }}>Copy</button>
                            <button className="btn" onClick={() => generateCoverLetter(selectedJob)}
                              style={{ background:"rgba(99,102,241,.1)", color:T.accentHi, border:`1px solid rgba(99,102,241,.25)`, padding:"4px 12px", borderRadius:6, fontSize:13, fontWeight:600 }}>Redo</button>
                          </>)}
                          <button onClick={() => setShowCoverLetter(false)} style={{ background:"none", border:"none", color:T.textMute, cursor:"pointer", fontSize:20, lineHeight:1 }}>×</button>
                        </div>
                      </div>
                      {isGenerating ? (
                        <div style={{ display:"flex", alignItems:"center", gap:10, color:T.textMute, padding:"8px 0" }}>
                          <span style={{ animation:"pulse 1s infinite" }}>⚡</span>
                          <span style={{ fontSize:14 }}>Writing your cover letter…</span>
                        </div>
                      ) : (<>
                        <textarea value={coverLetter} onChange={e => setCoverLetter(e.target.value)} rows={10}
                          style={{ width:"100%", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:"11px 13px", color:T.textSub, fontSize:14, lineHeight:1.9, resize:"vertical", fontFamily:"inherit", marginBottom:10 }} />
                        <div style={{ fontSize:13, color:T.textMute, marginBottom:6 }}>💬 Refine it:</div>
                        <div style={{ display:"flex", gap:7 }}>
                          <input value={clPrompt} onChange={e => setClPrompt(e.target.value)} onKeyDown={e => e.key==="Enter" && refineCoverLetter()}
                            placeholder='"Make it shorter" · "More confident" · "Highlight leadership"'
                            style={{ flex:1, background:T.bg, border:`1px solid ${T.border}`, borderRadius:7, padding:"8px 12px", color:T.text, fontSize:13 }} />
                          <button className="btn" onClick={refineCoverLetter} disabled={!clPrompt.trim() || isGenerating}
                            style={{ background:"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"#fff", padding:"8px 16px", borderRadius:7, fontSize:13, fontWeight:600 }}>Update</button>
                        </div>
                      </>)}
                    </div>
                  )}

                  {/* Quick analysis panel */}
                  {(isQuickAnalyzing || quickAnalysis?.jobId === selectedJob.id) && (
                    <div className="fade" style={{ background:T.surface, border:`1px solid rgba(56,189,248,.3)`, borderRadius:10, padding:"16px 18px", marginBottom:18 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:"#38bdf8" }}>🔍 Resume Fit</div>
                        <button onClick={() => setQuickAnalysis(null)} style={{ background:"none", border:"none", color:T.textMute, cursor:"pointer", fontSize:20 }}>×</button>
                      </div>
                      {isQuickAnalyzing ? (
                        <div style={{ display:"flex", gap:10, color:T.textMute, alignItems:"center" }}>
                          <span style={{ animation:"pulse 1s infinite" }}>⚡</span>
                          <span style={{ fontSize:14 }}>Analyzing your resume against this job…</span>
                        </div>
                      ) : (
                        <FormattedText T={T} text={quickAnalysis?.result} />
                      )}

                      {/* Action buttons after analysis */}
                      {quickAnalysis?.jobId === selectedJob.id && !isQuickAnalyzing && (
                        <div style={{ display:"flex", gap:8, marginTop:14, flexWrap:"wrap" }}>
                          <button className="btn" onClick={() => setActiveTab("resume")}
                            style={{ background:"rgba(56,189,248,.1)", color:"#38bdf8", border:"1px solid rgba(56,189,248,.25)", padding:"7px 14px", borderRadius:7, fontSize:13, fontWeight:600 }}>
                            Full Deep Analysis →
                          </button>
                          <button className="btn" onClick={() => rewriteResume(selectedJob)} disabled={isRewriting}
                            style={{ background:"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"#fff", padding:"7px 14px", borderRadius:7, fontSize:13, fontWeight:600, boxShadow:"0 3px 12px rgba(79,70,229,.4)" }}>
                            {isRewriting ? "✨ Rewriting…" : "✨ Rewrite Resume for This Job"}
                          </button>
                        </div>
                      )}

                      {/* Rewritten resume download panel */}
                      {isRewriting && (
                        <div style={{ marginTop:14, padding:"12px 14px", background:T.bg, borderRadius:8, border:`1px solid ${T.border}`, display:"flex", alignItems:"center", gap:10, color:T.textMute }}>
                          <span style={{ animation:"pulse 1s infinite" }}>✨</span>
                          <span style={{ fontSize:14 }}>Claude is rewriting your resume for this role…</span>
                        </div>
                      )}

                      {rewrittenResume?.jobId === selectedJob.id && !isRewriting && (
                        <div className="fade" style={{ marginTop:14, background:"rgba(74,222,128,.07)", border:`1px solid rgba(74,222,128,.3)`, borderRadius:10, padding:"14px 16px" }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                            <div style={{ fontSize:14, fontWeight:700, color:"#4ade80" }}>✨ AI-Optimized Resume Ready</div>
                            <button className="btn" onClick={() => downloadResume(rewrittenResume.text, rewrittenResume.jobTitle, rewrittenResume.company)}
                              style={{ background:"#16a34a", color:"#fff", padding:"7px 16px", borderRadius:7, fontSize:13, fontWeight:700 }}>
                              ⬇ Download .docx
                            </button>
                          </div>
                          <div style={{ fontSize:12, color:T.textMute, marginBottom:10, lineHeight:1.6 }}>
                            Tailored for <strong style={{ color:T.textSub }}>{rewrittenResume.jobTitle}</strong> at <strong style={{ color:T.textSub }}>{rewrittenResume.company}</strong>. Opens directly in Microsoft Word — just add your own formatting touches.
                          </div>
                          <textarea value={rewrittenResume.text} readOnly rows={8}
                            style={{ width:"100%", background:T.bg, border:`1px solid ${T.border}`, borderRadius:7, padding:"9px 12px", color:T.textSub, fontSize:12, lineHeight:1.7, resize:"vertical", fontFamily:"inherit" }} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Job description */}
                  <div style={{ fontSize:11, color:T.textMute, marginBottom:8, fontWeight:600, textTransform:"uppercase", letterSpacing:.7 }}>Job Description</div>
                  <div style={{ background:T.surface, borderRadius:9, padding:"14px 16px", border:`1px solid ${T.border}`, marginBottom:18 }}>
                    <FormattedText T={T} text={selectedJob.description || "No description available."} />
                  </div>

                  {/* Notes */}
                  <div style={{ fontSize:11, color:T.textMute, marginBottom:6, fontWeight:600, textTransform:"uppercase", letterSpacing:.7 }}>Personal Notes</div>
                  <textarea value={notes[selectedJob.id] || ""} onChange={e => setNotes(p => ({ ...p, [selectedJob.id]:e.target.value }))}
                    placeholder="Contact info, follow-up dates, interview notes…" rows={3}
                    style={{ width:"100%", background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 12px", color:T.textSub, fontSize:14, resize:"vertical", lineHeight:1.7 }} />
                </div>
              </>
            ) : (
              <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                <div style={{ fontSize:48, marginBottom:14, opacity:.15 }}>🗂</div>
                <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:15, color:T.textMute }}>
                  {jobs.length === 0 ? "Hit ⚡ Search Jobs to get started" : "Select a job to see details"}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          RESUME TAB
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab==="resume" && (
        <div style={{ flex:1, overflowY:"auto", padding:"22px" }}>
          <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:16, fontWeight:700, marginBottom:4 }}>📄 Resumes & Match Analysis</div>
          <div style={{ fontSize:13, color:T.textMute, marginBottom:20 }}>Upload a resume per profile. Used for accurate match scores, cover letters, and gap analysis.</div>

          {/* Profile resume cards */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:26 }}>
            {profiles.map(p => (
              <div key={p.id} style={{ background:T.surface, border:`1px solid ${p.resume ? p.color+"60" : T.border}`, borderRadius:12, padding:"16px 18px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                  <div style={{ fontSize:20 }}>{p.icon}</div>
                  <div>
                    <div style={{ fontSize:15, fontWeight:700 }}>{p.title}</div>
                    <div style={{ fontSize:12, color:p.resume ? "#4ade80" : T.textMute }}>{p.resume ? "✅ Resume attached" : "No resume yet"}</div>
                  </div>
                </div>
                <label style={{ display:"block", marginBottom:8 }}>
                  <div style={{ background:p.resume?"rgba(74,222,128,.08)":"rgba(79,70,229,.1)", color:p.resume?"#4ade80":T.accentHi,
                    border:`1px dashed ${p.resume?"rgba(74,222,128,.4)":"rgba(99,102,241,.4)"}`, borderRadius:8, padding:"9px",
                    textAlign:"center", cursor:"pointer", fontSize:13, fontWeight:600 }}>
                    {uploadingResume===p.id ? "⚡ Uploading…" : p.resume ? "📎 Replace Resume" : "📎 Upload PDF, Word, or TXT"}
                  </div>
                  <input type="file" accept=".pdf,.docx,.doc,.txt" style={{ display:"none" }}
                    onChange={e => { if (e.target.files[0]) handleResumeUpload(e.target.files[0], p.id); }} />
                </label>
                <div style={{ fontSize:11, color:T.textMute, marginBottom:5, textAlign:"center" }}>— or paste below —</div>
                <textarea value={p.resume || ""} onChange={e => setProfiles(prev => prev.map(pr => pr.id===p.id ? {...pr,resume:e.target.value} : pr))}
                  placeholder="Paste resume text here…" rows={4}
                  style={{ width:"100%", background:T.bg, border:`1px solid ${T.border}`, borderRadius:7, padding:"8px 11px", color:T.textSub, fontSize:12, resize:"vertical", lineHeight:1.6 }} />
                {p.resume && (
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:7 }}>
                    <span style={{ fontSize:11, color:T.textMute }}>{p.resume.split(" ").length} words</span>
                    <button className="btn" onClick={() => setProfiles(prev => prev.map(pr => pr.id===p.id ? {...pr,resume:""} : pr))}
                      style={{ background:"rgba(239,68,68,.1)", color:"#f87171", border:"1px solid rgba(239,68,68,.2)", padding:"3px 9px", borderRadius:6, fontSize:11, fontWeight:600 }}>Clear</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Deep analysis */}
          <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:15, fontWeight:700, marginBottom:5 }}>🔍 Deep Resume Analysis</div>
          <div style={{ fontSize:13, color:T.textMute, marginBottom:14 }}>
            {selectedJob ? `Analyzing: ${selectedJob.title} at ${selectedJob.company} · ${selectedJob.match}% match` : "Select a job from the Jobs tab first, then analyze."}
          </div>
          <div style={{ display:"flex", gap:18, flexWrap:"wrap" }}>
            <div style={{ flex:1, minWidth:280 }}>
              <textarea value={resumeText} onChange={e => setResumeText(e.target.value)} rows={14}
                placeholder="Paste your full resume here, or upload above and it auto-fills…"
                style={{ width:"100%", background:T.surface, border:`1px solid ${T.border}`, borderRadius:9, padding:"13px 15px", color:T.text, fontSize:14, lineHeight:1.7, resize:"vertical", marginBottom:10 }} />
              <button className="btn" onClick={runFullAnalysis} disabled={!selectedJob || isAnalyzing} style={{
                background:"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"#fff", padding:"10px 22px", borderRadius:8, fontSize:14, fontWeight:600,
                boxShadow:"0 4px 14px rgba(79,70,229,.4)", opacity:!selectedJob ? ".4" : "1"
              }}>{isAnalyzing ? "⚡ Analyzing…" : "🔍 Analyze My Resume"}</button>
            </div>
            <div style={{ flex:1, minWidth:280 }}>
              {analysisResult ? (
                <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:"18px" }}>
                  {/* Score highlight */}
                  {(() => {
                    const score = getScoreFromAnalysis(analysisResult);
                    return score !== null ? (
                      <div style={{ background:score>=70?"rgba(74,222,128,.1)":"rgba(251,191,36,.1)",
                        border:`2px solid ${score>=70?"rgba(74,222,128,.35)":"rgba(251,191,36,.35)"}`,
                        borderRadius:10, padding:"12px 16px", marginBottom:14, display:"flex", alignItems:"center", gap:12 }}>
                        <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:38, fontWeight:700, color:score>=70?"#4ade80":"#fbbf24", lineHeight:1 }}>{score}%</div>
                        <div>
                          <div style={{ fontSize:14, fontWeight:700 }}>Resume Match Score</div>
                          <div style={{ fontSize:12, color:T.textMute, marginTop:2 }}>{score>=80?"Strong match — apply with confidence":score>=60?"Good match — a few tweaks will help":"Needs work before applying"}</div>
                        </div>
                      </div>
                    ) : null;
                  })()}
                  <FormattedText T={T} text={analysisResult.replace(/MATCH SCORE:\s*\d+%\n?/, "").trim()} />
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", minHeight:200, opacity:.35 }}>
                  <div style={{ fontSize:44, marginBottom:10 }}>📊</div>
                  <div style={{ fontSize:14, color:T.textMute, textAlign:"center", lineHeight:1.7 }}>Select a job, add your resume,<br/>and click Analyze</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          JOB COACH TAB
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab==="coach" && (
        <div style={{ flex:1, display:"flex", flexDirection:"column", maxWidth:720, margin:"0 auto", width:"100%", padding:"0 22px" }}>
          <div style={{ padding:"16px 0 10px" }}>
            <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:16, fontWeight:700 }}>🤖 AI Job Coach</div>
            <div style={{ fontSize:13, color:T.textMute, marginTop:2 }}>Ask me anything — interview prep, salary negotiation, resume advice.</div>
            {selectedJob && <div style={{ fontSize:12, color:T.accentHi, marginTop:3 }}>Context: {selectedJob.title} at {selectedJob.company}</div>}
          </div>
          <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:10, paddingBottom:12 }}>
            {coachMessages.map((msg, i) => (
              <div key={i} style={{ display:"flex", justifyContent:msg.role==="user"?"flex-end":"flex-start" }}>
                <div style={{ maxWidth:"82%", padding:"11px 15px", borderRadius:12, fontSize:14, lineHeight:1.7,
                  background:msg.role==="user" ? T.accent : T.surface,
                  color:msg.role==="user" ? "#fff" : T.text,
                  borderBottomRightRadius:msg.role==="user" ? 2 : 12,
                  borderBottomLeftRadius:msg.role==="assistant" ? 2 : 12,
                  border:msg.role==="assistant" ? `1px solid ${T.border}` : "none",
                  whiteSpace:"pre-wrap" }}>{msg.content}</div>
              </div>
            ))}
            {coachLoading && (
              <div style={{ display:"flex" }}>
                <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:"11px 15px", fontSize:14, color:T.textMute, display:"flex", gap:8, alignItems:"center" }}>
                  <span style={{ animation:"pulse 1s infinite" }}>⚡</span> Thinking…
                </div>
              </div>
            )}
          </div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
            {["Is this job worth applying to?","Help me prep for this interview","How do I negotiate salary?","What skills should I add to my resume?"].map(q => (
              <button key={q} className="pill" onClick={() => setCoachInput(q)} style={{ padding:"4px 11px", borderRadius:20, fontSize:12, background:"transparent", color:T.textSub, border:`1px solid ${T.border}` }}>{q}</button>
            ))}
          </div>
          <div style={{ display:"flex", gap:7, paddingBottom:14 }}>
            <input value={coachInput} onChange={e => setCoachInput(e.target.value)} onKeyDown={e => e.key==="Enter" && !e.shiftKey && sendCoachMessage()}
              placeholder="Ask your job coach anything…"
              style={{ flex:1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:9, padding:"10px 14px", color:T.text, fontSize:14 }} />
            <button className="btn" onClick={sendCoachMessage} disabled={!coachInput.trim() || coachLoading}
              style={{ background:"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"#fff", padding:"10px 18px", borderRadius:9, fontSize:14, fontWeight:600 }}>Send</button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          INSIGHTS TAB
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab==="insights" && (
        <div style={{ flex:1, overflowY:"auto", padding:"22px" }}>

          {jobs.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 20px", color:T.textMute }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📈</div>
              <div style={{ fontSize:16, fontWeight:600, color:T.textSub, marginBottom:6 }}>No data yet</div>
              <div style={{ fontSize:13 }}>Search for jobs first — your insights will appear here.</div>
            </div>
          ) : (<>

            {/* ── Metric cards ── */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:24 }}>
              {[
                ["Total tracked", jobs.length, T.accentHi],
                ["Applied", jobs.filter(j=>j.status==="Applied").length, "#60a5fa"],
                ["Interviews", jobs.filter(j=>j.status==="Interview").length, "#c084fc"],
                ["Response rate", jobs.filter(j=>j.status!=="New"&&j.status!=="Saved").length
                  ? Math.round((jobs.filter(j=>["Interview","Offer"].includes(j.status)).length /
                    Math.max(jobs.filter(j=>j.status==="Applied").length,1))*100)+"%"
                  : "—", "#4ade80"],
              ].map(([label, value, color]) => (
                <div key={label} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:"14px 16px" }}>
                  <div style={{ fontSize:12, color:T.textMute, marginBottom:4 }}>{label}</div>
                  <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:26, fontWeight:700, color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* ── Two charts row ── */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>

              {/* Pipeline donut */}
              <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:"16px 18px" }}>
                <div style={{ fontSize:13, fontWeight:600, color:T.textSub, marginBottom:12 }}>Application pipeline</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginBottom:10 }}>
                  {[["New","#4ade80"],["Saved","#fbbf24"],["Applied","#60a5fa"],["Interview","#c084fc"],["Offer","#f472b6"],["Rejected","#f87171"]].map(([s,c]) => {
                    const n = jobs.filter(j=>j.status===s).length;
                    return n > 0 ? (
                      <span key={s} style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:T.textSub }}>
                        <span style={{ width:10, height:10, borderRadius:2, background:c, display:"inline-block" }}/>
                        {s} {n}
                      </span>
                    ) : null;
                  })}
                </div>
                <div style={{ position:"relative", width:"100%", height:200 }}>
                  <canvas id="ins-pipeline"></canvas>
                </div>
              </div>

              {/* Jobs per profile bar */}
              <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:"16px 18px" }}>
                <div style={{ fontSize:13, fontWeight:600, color:T.textSub, marginBottom:12 }}>Jobs by profile</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginBottom:10 }}>
                  {profiles.map(p => (
                    <span key={p.id} style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:T.textSub }}>
                      <span style={{ width:10, height:10, borderRadius:2, background:p.color, display:"inline-block" }}/>
                      {p.icon} {p.title.split(" ")[0]}
                    </span>
                  ))}
                </div>
                <div style={{ position:"relative", width:"100%", height:200 }}>
                  <canvas id="ins-profiles"></canvas>
                </div>
              </div>
            </div>

            {/* ── Work type bar ── */}
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:"16px 18px", marginBottom:24 }}>
              <div style={{ fontSize:13, fontWeight:600, color:T.textSub, marginBottom:4 }}>Remote vs Hybrid vs Onsite</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginBottom:10 }}>
                {[["Remote","#059669"],["Hybrid","#d97706"],["Onsite","#4f46e5"]].map(([wt,c]) => {
                  const n = jobs.filter(j=>j.workType===wt).length;
                  return <span key={wt} style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:T.textSub }}>
                    <span style={{ width:10, height:10, borderRadius:2, background:c, display:"inline-block" }}/>{wt} {n}
                  </span>;
                })}
              </div>
              <div style={{ position:"relative", width:"100%", height:140 }}>
                <canvas id="ins-worktype"></canvas>
              </div>
            </div>

            {/* ── Top matches ── */}
            <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:15, fontWeight:700, marginBottom:12, color:T.text }}>🔥 Top matches to apply now</div>
            {sortJobs(jobs.filter(j => j.status==="New")).slice(0,5).map((job, i) => {
              const p = profileOf(job);
              return (
                <div key={job.id} onClick={() => { setSelectedJob(job); setActiveTab("jobs"); setQuickAnalysis(null); }}
                  style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:9, padding:"12px 14px",
                    display:"flex", alignItems:"center", gap:12, cursor:"pointer", marginBottom:7, transition:"all .13s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor="#5855d6"; e.currentTarget.style.background=T.surfaceHi; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor=T.border; e.currentTarget.style.background=T.surface; }}>
                  <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:14, fontWeight:700, color:T.accentHi, width:24 }}>#{i+1}</div>
                  <div style={{ fontSize:16 }}>{p?.icon||"💼"}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:T.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{job.title}</div>
                    <div style={{ fontSize:12, color:T.textSub, display:"flex", gap:6, marginTop:2 }}>
                      <span>{job.company}</span><span>·</span>
                      <span style={{ color:WORK_TYPE_CONFIG[job.workType]?.bg||T.textSub, fontWeight:600 }}>{job.workType}</span>
                      {job.salary && job.salary!=="Not listed" && <><span>·</span><span style={{ color:salaryColor(job.salaryMax, T.textSub) }}>{job.salary}</span></>}
                    </div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <span style={{ ...STATUS_CONFIG[job.status], padding:"3px 8px", borderRadius:5, fontSize:11, fontWeight:600 }}>{job.status}</span>
                    <div style={{ fontSize:11, color:T.textMute, marginTop:3 }}>{job.postedLabel}</div>
                  </div>
                </div>
              );
            })}

            {/* Chart.js renderer */}
            <InsightsCharts jobs={jobs} profiles={profiles} darkMode={darkMode} />
          </>)}
        </div>
      )}

      {/* Footer */}
      <div style={{ padding:"9px 22px", borderTop:`1px solid ${T.border}`, background:T.surface, display:"flex", justifyContent:"space-between", fontSize:12, color:T.textMute }}>
        <div>Rolefindr · {location} · LinkedIn · Indeed · ZipRecruiter · Glassdoor · Google</div>
        <div>Match → Salary → Newest</div>
      </div>
    </div>
  );
}
