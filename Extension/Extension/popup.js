const SERVER = "http://localhost:3002";

const DEFAULT_PROFILES = [
  { id:"p1", title:"Digital Marketing", icon:"📊" },
  { id:"p2", title:"Cybersecurity",     icon:"🔒" },
  { id:"p3", title:"Concierge",         icon:"🏨" },
  { id:"p4", title:"Remote Customer Service", icon:"🎧" },
];

async function getProfiles() {
  try {
    const r = await fetch(`${SERVER}/db/profiles`);
    const d = await r.json();
    return d.profiles?.length ? d.profiles : DEFAULT_PROFILES;
  } catch { return DEFAULT_PROFILES; }
}

function renderForm(job, profiles) {
  const main = document.getElementById("main");
  const profileOptions = profiles.map(p =>
    `<option value="${p.id}">${p.icon} ${p.title}</option>`
  ).join("");

  main.innerHTML = `
    <div class="field">
      <label>Job Title</label>
      <input id="f-title" value="${esc(job.title)}" placeholder="Job title" />
    </div>
    <div class="row">
      <div class="field">
        <label>Company</label>
        <input id="f-company" value="${esc(job.company)}" placeholder="Company" />
      </div>
      <div class="field">
        <label>Location</label>
        <input id="f-location" value="${esc(job.location)}" placeholder="Location" />
      </div>
    </div>
    <div class="row">
      <div class="field">
        <label>Work Type</label>
        <select id="f-worktype">
          <option value="Onsite"  ${job.workType==="Onsite" ?"selected":""}>Onsite</option>
          <option value="Remote"  ${job.workType==="Remote" ?"selected":""}>Remote</option>
          <option value="Hybrid"  ${job.workType==="Hybrid" ?"selected":""}>Hybrid</option>
        </select>
      </div>
      <div class="field">
        <label>Profile</label>
        <select id="f-profile">${profileOptions}</select>
      </div>
    </div>
    <div class="field">
      <label>Description preview</label>
      <textarea id="f-desc">${esc(job.description.slice(0,500))}</textarea>
    </div>
    <button class="btn-save" id="save-btn">💾 Save to JobPilot</button>
    <div class="status" id="status-msg"></div>
  `;

  document.getElementById("save-btn").addEventListener("click", () => saveJob(job.url, job.source));
}

async function saveJob(url, source) {
  const btn = document.getElementById("save-btn");
  btn.disabled = true; btn.textContent = "Saving…";

  const payload = {
    title:       document.getElementById("f-title").value.trim(),
    company:     document.getElementById("f-company").value.trim(),
    location:    document.getElementById("f-location").value.trim(),
    workType:    document.getElementById("f-worktype").value,
    profileId:   document.getElementById("f-profile").value,
    description: document.getElementById("f-desc").value.trim(),
    url,
    source,
  };

  try {
    const r = await fetch(`${SERVER}/save-job`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      showStatus("✅ Saved! Open JobPilot to see it.", "success");
      btn.textContent = "✅ Saved!";
    } else {
      throw new Error("Server error");
    }
  } catch {
    showStatus("❌ Could not connect to JobPilot. Make sure the server is running.", "error");
    btn.disabled = false; btn.textContent = "💾 Save to JobPilot";
  }
}

function showStatus(msg, type) {
  const el = document.getElementById("status-msg");
  el.textContent = msg; el.className = `status ${type}`;
}

function esc(s) {
  return (s || "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── Boot ─────────────────────────────────────────────────────────────────────
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Inject content script if not already there
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  } catch {}

  // Extract job from page
  let job = { title:"", company:"", location:"", description:"", workType:"Onsite", url: tab.url, source:"" };
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__jobpilotExtract ? window.__jobpilotExtract() : null,
    });
    if (results?.[0]?.result) job = results[0].result;
  } catch {}

  const profiles = await getProfiles();

  if (!job.title && !job.company) {
    document.getElementById("main").innerHTML = `
      <div class="no-job">
        <b>No job detected on this page.</b><br><br>
        Navigate to a job posting on LinkedIn, Indeed, Glassdoor, ZipRecruiter, or a company careers page, then click this button.
      </div>`;
    return;
  }

  renderForm(job, profiles);
})();
