// JobPilot content script — extracts job info from supported pages
(function() {
  function extractJob() {
    const url = window.location.href;
    let title = "", company = "", location = "", description = "", workType = "Onsite";

    // ── LinkedIn ──────────────────────────────────────────────────────────────
    if (url.includes("linkedin.com/jobs")) {
      title       = document.querySelector(".job-details-jobs-unified-top-card__job-title, h1.topcard__title")?.innerText?.trim() || "";
      company     = document.querySelector(".job-details-jobs-unified-top-card__company-name, a.topcard__org-name-link")?.innerText?.trim() || "";
      location    = document.querySelector(".job-details-jobs-unified-top-card__bullet, .topcard__flavor--bullet")?.innerText?.trim() || "";
      description = document.querySelector(".jobs-description__content, .description__text")?.innerText?.trim() || "";
      const wt    = document.querySelector(".job-details-jobs-unified-top-card__workplace-type")?.innerText?.toLowerCase() || "";
      workType    = wt.includes("remote") ? "Remote" : wt.includes("hybrid") ? "Hybrid" : "Onsite";
    }

    // ── Indeed ────────────────────────────────────────────────────────────────
    else if (url.includes("indeed.com")) {
      title       = document.querySelector("h1.jobsearch-JobInfoHeader-title, h1[data-testid='jobsearch-JobInfoHeader-title']")?.innerText?.trim() || "";
      company     = document.querySelector("[data-testid='inlineHeader-companyName'] a, .jobsearch-InlineCompanyRating-companyHeader a")?.innerText?.trim() || "";
      location    = document.querySelector("[data-testid='job-location'], .jobsearch-JobInfoHeader-subtitle .jobsearch-JobInfoHeader-locationText")?.innerText?.trim() || "";
      description = document.querySelector("#jobDescriptionText, .jobsearch-jobDescriptionText")?.innerText?.trim() || "";
    }

    // ── ZipRecruiter ──────────────────────────────────────────────────────────
    else if (url.includes("ziprecruiter.com")) {
      title       = document.querySelector("h1.job_title, h1[class*='title']")?.innerText?.trim() || "";
      company     = document.querySelector(".hiring_company_text, [class*='company']")?.innerText?.trim() || "";
      location    = document.querySelector(".location, [class*='location']")?.innerText?.trim() || "";
      description = document.querySelector(".job_description, [class*='description']")?.innerText?.trim() || "";
    }

    // ── Glassdoor ─────────────────────────────────────────────────────────────
    else if (url.includes("glassdoor.com")) {
      title       = document.querySelector("[data-test='job-title'], h1")?.innerText?.trim() || "";
      company     = document.querySelector("[data-test='employer-name'], .employerName")?.innerText?.trim() || "";
      location    = document.querySelector("[data-test='location'], .location")?.innerText?.trim() || "";
      description = document.querySelector("[class*='JobDetails'], .desc")?.innerText?.trim() || "";
    }

    // ── Lever / Greenhouse / Ashby / Workable (generic ATS) ──────────────────
    else {
      title       = document.querySelector("h1, .job-title, [class*='title']")?.innerText?.trim() || document.title || "";
      company     = document.querySelector(".company-name, [class*='company']")?.innerText?.trim() || new URL(url).hostname.replace("www.","").split(".")[0] || "";
      location    = document.querySelector(".location, [class*='location']")?.innerText?.trim() || "";
      description = document.querySelector(".content, .description, main, article")?.innerText?.trim() || "";
    }

    // Trim description to reasonable size
    if (description.length > 3000) description = description.slice(0, 3000);

    return { title, company, location, description, workType, url, source: new URL(url).hostname.replace("www.","") };
  }

  // Expose for popup to call
  window.__jobpilotExtract = extractJob;
})();
