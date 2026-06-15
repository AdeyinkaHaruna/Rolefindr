#!/usr/local/bin/python3
"""
Rolefindr Server v9 — Fixed stale jobs, added date filtering, converted to FastAPI
"""

from jobspy import scrape_jobs
import pandas as pd
from datetime import datetime, timedelta
import json, os, re, html, urllib.request, urllib.parse
from supabase import create_client
import stripe
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def load_env():
    env = {}
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    try:
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    for key in ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "ANTHROPIC_API_KEY",
                "STRIPE_SECRET_KEY", "STRIPE_PRICE_MONTHLY", "STRIPE_PRICE_YEARLY",
                "USAJOBS_API_KEY", "USAJOBS_EMAIL"]:
        val = os.environ.get(key)
        if val:
            env[key] = val
    return env

ENV = load_env()
SUPABASE_URL = ENV.get("SUPABASE_URL", "")
SUPABASE_KEY = ENV.get("SUPABASE_SERVICE_KEY", "")
stripe.api_key = ENV.get("STRIPE_SECRET_KEY", "") or os.environ.get("STRIPE_SECRET_KEY", "")
PRICE_MONTHLY = ENV.get("STRIPE_PRICE_MONTHLY", "") or os.environ.get("STRIPE_PRICE_MONTHLY", "")
PRICE_YEARLY  = ENV.get("STRIPE_PRICE_YEARLY", "")  or os.environ.get("STRIPE_PRICE_YEARLY", "")
USAJOBS_KEY   = ENV.get("USAJOBS_API_KEY", "")
USAJOBS_EMAIL = ENV.get("USAJOBS_EMAIL", "")

# Max age of jobs to show (days)
MAX_JOB_AGE_DAYS = 30

def get_db():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise Exception("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def clean_description(text):
    if not text: return "No description available."
    text = html.unescape(text)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\*{1,3}(.*?)\*{1,3}', r'\1', text)
    text = re.sub(r'_{1,2}(.*?)_{1,2}', r'\1', text)
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
    text = re.sub(r'\\(?!n)', '', text)
    text = re.sub(r'^\s*[·•◦▪▸►➢➤‣⁃]\s*', '- ', text, flags=re.MULTILINE)
    text = re.sub(r'^[-_=]{3,}\s*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return '\n'.join(l.rstrip() for l in text.splitlines()).strip()

def parse_job(row, location):
    def safe(col, fallback=""):
        val = row.get(col, fallback)
        try:
            if pd.isna(val): return fallback
        except: pass
        return str(val).strip() if val else fallback

    wtype = safe("job_type", "").lower()
    work_type = "Remote" if ("remote" in wtype or safe("is_remote")=="True") else \
                "Hybrid" if "hybrid" in wtype else "Onsite"

    date_posted = safe("date_posted", "")
    try:
        if date_posted:
            dt = datetime.strptime(date_posted[:10], "%Y-%m-%d")
            delta = (datetime.now() - dt).days
            posted_label = "Today" if delta==0 else "Yesterday" if delta==1 else \
                           f"{delta}d ago" if delta<7 else f"{delta//7}w ago" if delta<30 else dt.strftime("%b %d")
        else: posted_label = ""; delta = 999
    except: posted_label = ""; delta = 999

    min_sal, max_sal, interval = safe("min_amount"), safe("max_amount"), safe("interval","yearly")
    try:
        if min_sal and max_sal:
            mn, mx = float(min_sal), float(max_sal)
            salary = f"${mn:.0f}–${mx:.0f}/hr" if interval=="hourly" else f"${mn/1000:.0f}k–${mx/1000:.0f}k"
            salary_max = mx
        else: salary = "Not listed"; salary_max = 0
    except: salary = "Not listed"; salary_max = 0

    return {
        "id": safe("id", str(abs(hash(safe("job_url"))))),
        "title": safe("title","Untitled"),
        "company": safe("company","Unknown"),
        "location": safe("location", location),
        "salary": salary,
        "salaryMax": salary_max,
        "source": safe("site","").replace("_"," ").title(),
        "workType": work_type,
        "description": clean_description(safe("description",""))[:2000],
        "url": safe("job_url","#"),
        "datePosted": date_posted[:10] if date_posted else "",
        "postedLabel": posted_label,
        "daysAgo": delta,
        "status": "New",
        "remote": work_type=="Remote",
    }

def do_scrape(search_term, location, hours_old, is_remote, results):
    all_jobs = []
    try:
        boards = ["linkedin", "indeed", "google"]
        params = dict(
            site_name=boards,
            search_term=search_term,
            google_search_term=f"{search_term} jobs near {location}",
            location="" if is_remote else location,
            results_wanted=results,
            country_indeed="USA",
            linkedin_fetch_description=True
        )
        if hours_old: params["hours_old"] = hours_old
        if is_remote: params["is_remote"] = True
        df = scrape_jobs(**params)
        if df is not None and not df.empty:
            jobs = [parse_job(row, location) for _, row in df.iterrows()]
            # FIX: filter out jobs older than MAX_JOB_AGE_DAYS immediately after scrape
            jobs = [j for j in jobs if j["daysAgo"] <= MAX_JOB_AGE_DAYS]
            all_jobs.extend(jobs)
            print(f"    ✅ JobSpy ({search_term[:25]}): {len(jobs)} jobs")
    except Exception as e:
        print(f"    ⚠️  JobSpy error: {e}")
    return all_jobs

def scrape_usajobs(search_term, location, is_remote, results=10):
    if not USAJOBS_KEY or not USAJOBS_EMAIL:
        return []
    try:
        params = {"Keyword": search_term, "ResultsPerPage": str(results), "Fields": "min"}
        if is_remote:
            params["RemoteIndicator"] = "True"
        elif location:
            params["LocationName"] = location
        url = "https://data.usajobs.gov/api/search?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={
            "Host": "data.usajobs.gov",
            "User-Agent": USAJOBS_EMAIL,
            "Authorization-Key": USAJOBS_KEY,
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        jobs = []
        for item in data.get("SearchResult", {}).get("SearchResultItems", []):
            pos = item.get("MatchedObjectDescriptor", {})
            pay = pos.get("PositionRemuneration", [{}])[0]
            try:
                mn = float(pay.get("MinimumRange", 0))
                mx = float(pay.get("MaximumRange", 0))
                interval = pay.get("RateIntervalCode", "PA")
                salary = f"${mn:.0f}–${mx:.0f}/hr" if interval=="PH" else f"${mn/1000:.0f}k–${mx/1000:.0f}k"
                salary_max = mx
            except:
                salary = "Not listed"; salary_max = 0
            loc_list = pos.get("PositionLocation", [{}])
            job_loc = loc_list[0].get("LocationName", location) if loc_list else location
            work_type = "Remote" if pos.get("PositionRemoteIndicator","") == "1" else "Onsite"
            date_posted = pos.get("PublicationStartDate", "")[:10]
            try:
                if date_posted:
                    dt = datetime.strptime(date_posted, "%Y-%m-%d")
                    delta = (datetime.now() - dt).days
                    posted_label = "Today" if delta==0 else f"{delta}d ago" if delta<7 else f"{delta//7}w ago"
                else: delta = 999; posted_label = ""
            except: delta = 999; posted_label = ""

            # FIX: skip old USAJobs listings
            if delta > MAX_JOB_AGE_DAYS:
                continue

            apply_url = pos.get("ApplyURI", ["#"])[0] if pos.get("ApplyURI") else "#"
            jobs.append({
                "id": str(abs(hash(apply_url + pos.get("PositionTitle","")))),
                "title": pos.get("PositionTitle", "Untitled"),
                "company": pos.get("OrganizationName", "U.S. Government"),
                "location": job_loc,
                "salary": salary, "salaryMax": salary_max,
                "source": "USAJobs", "workType": work_type,
                "description": clean_description(pos.get("UserArea",{}).get("Details",{}).get("JobSummary",""))[:2000],
                "url": apply_url, "datePosted": date_posted,
                "postedLabel": posted_label, "daysAgo": delta,
                "status": "New", "remote": work_type=="Remote",
            })
        print(f"    ✅ USAJobs ({search_term[:25]}): {len(jobs)} jobs")
        return jobs
    except Exception as e:
        print(f"    ⚠️  USAJobs error: {e}")
        return []

def dedupe(jobs):
    seen = set(); unique = []
    for j in jobs:
        k = f"{j['title'].lower().strip()}-{j['company'].lower().strip()}"
        if k not in seen: seen.add(k); unique.append(j)
    return unique

def db_upsert_jobs(jobs, user_id=""):
    db = get_db()
    for job in jobs:
        try:
            existing = db.table("jobs").select("status,note").eq("id", job["id"]).eq("user_id", user_id).execute()
            if existing.data:
                job["status"] = existing.data[0]["status"]
                db.table("jobs").update({
                    "data": job, "profile_id": job.get("profileId",""),
                    "saved_at": datetime.now().isoformat()
                }).eq("id", job["id"]).eq("user_id", user_id).execute()
            else:
                db.table("jobs").insert({
                    "id": job["id"], "profile_id": job.get("profileId",""),
                    "data": job, "status": job.get("status","New"),
                    "note": "", "user_id": user_id
                }).execute()
        except Exception as e:
            print(f"    ⚠️  upsert error: {e}")

def db_load_all_jobs(user_id=""):
    """
    FIX: Only load jobs from the last MAX_JOB_AGE_DAYS days.
    This prevents old/expired jobs from flooding the UI on refresh.
    """
    db = get_db()
    cutoff = (datetime.now() - timedelta(days=MAX_JOB_AGE_DAYS)).isoformat()
    rows = db.table("jobs").select("data,status,note,profile_id") \
             .eq("user_id", user_id) \
             .gte("saved_at", cutoff) \
             .order("saved_at", desc=True) \
             .limit(200) \
             .execute()
    out = []
    for r in rows.data:
        try:
            job = r["data"] if isinstance(r["data"], dict) else json.loads(r["data"])
            job["status"] = r["status"]
            job["note"] = r["note"] or ""
            if r.get("profile_id"):
                job["profileId"] = r["profile_id"]
            # Secondary filter: skip jobs older than MAX_JOB_AGE_DAYS by datePosted
            date_posted = job.get("datePosted", "")
            if date_posted:
                try:
                    dt = datetime.strptime(date_posted, "%Y-%m-%d")
                    if (datetime.now() - dt).days > MAX_JOB_AGE_DAYS:
                        continue
                except:
                    pass
            out.append(job)
        except: pass
    return out

def db_update_status(job_id, status, user_id=""):
    get_db().table("jobs").update({"status": status}).eq("id", job_id).eq("user_id", user_id).execute()

def db_update_note(job_id, note, user_id=""):
    get_db().table("jobs").update({"note": note}).eq("id", job_id).eq("user_id", user_id).execute()

def db_delete_job(job_id, user_id=""):
    db = get_db()
    db.table("jobs").delete().eq("id", job_id).eq("user_id", user_id).execute()
    db.table("timeline").delete().eq("job_id", job_id).eq("user_id", user_id).execute()

def db_save_profiles(profiles, user_id=""):
    db = get_db()
    db.table("profiles").delete().eq("user_id", user_id).execute()
    for p in profiles:
        db.table("profiles").upsert({
            "id": f"{user_id}_{p['id']}", "data": p, "user_id": user_id
        }).execute()

def db_load_profiles(user_id=""):
    rows = get_db().table("profiles").select("data").eq("user_id", user_id).execute()
    return [r["data"] if isinstance(r["data"], dict) else json.loads(r["data"]) for r in rows.data]

def db_add_timeline(job_id, etype, note, event_date, user_id=""):
    get_db().table("timeline").insert({
        "job_id": job_id, "type": etype, "note": note,
        "event_date": event_date, "user_id": user_id
    }).execute()
    return db_get_timeline(job_id, user_id)

def db_get_timeline(job_id, user_id=""):
    rows = get_db().table("timeline").select("*").eq("job_id", job_id)\
           .eq("user_id", user_id).order("created_at").execute()
    return rows.data

def db_delete_timeline_event(ev_id, user_id=""):
    get_db().table("timeline").delete().eq("id", ev_id).eq("user_id", user_id).execute()

def db_export(user_id=""):
    jobs = db_load_all_jobs(user_id)
    profiles = db_load_profiles(user_id)
    tl = get_db().table("timeline").select("*").eq("user_id", user_id)\
         .order("created_at").execute().data
    return {"jobs": jobs, "profiles": profiles, "timeline": tl,
            "exported_at": datetime.now().isoformat()}

def db_import(data, user_id=""):
    jobs = data.get("jobs",[]); profiles = data.get("profiles",[]); tl = data.get("timeline",[])
    if jobs: db_upsert_jobs(jobs, user_id)
    if profiles: db_save_profiles(profiles, user_id)
    db = get_db()
    for ev in tl:
        try:
            db.table("timeline").upsert({
                "job_id": ev.get("job_id"), "type": ev.get("type","Note"),
                "note": ev.get("note",""), "event_date": ev.get("event_date","")
            }).execute()
        except: pass
    return len(jobs), len(profiles)

# ─── FastAPI Routes ───────────────────────────────────────────────────────────

def get_uid(request: Request, body: dict = {}):
    return request.headers.get("X-User-Id", "") or body.get("userId", "")

@app.get("/ping")
async def ping():
    return {"ok": True}

@app.get("/db/jobs")
async def get_jobs(request: Request):
    uid = get_uid(request)
    return {"jobs": db_load_all_jobs(uid)}

@app.get("/db/profiles")
async def get_profiles(request: Request):
    uid = get_uid(request)
    return {"profiles": db_load_profiles(uid)}

@app.get("/db/timeline/{job_id}")
async def get_timeline(job_id: str, request: Request):
    uid = get_uid(request)
    return {"timeline": db_get_timeline(job_id, uid)}

@app.get("/db/export")
async def export(request: Request):
    uid = get_uid(request)
    return db_export(uid)

@app.post("/search")
async def search(request: Request):
    body = await request.json()
    uid = get_uid(request, body)
    try:
        location     = body.get("location", "Silver Spring, MD")
        search_term  = body.get("search_term", "")
        search_terms = body.get("search_terms", [])
        time_filter  = body.get("time_filter", "week")
        results_n    = body.get("results", 10)
        is_remote    = body.get("remote", False)
        profile_id   = body.get("profile_id", "")
        all_terms = list(dict.fromkeys(
            t.strip() for t in [search_term] + search_terms if t.strip()
        ))[:2]
        hours_map = {"24h":24,"3d":72,"week":168,"2w":336,"3w":504,"month":720,"any":None}
        hours_old = hours_map.get(time_filter, 168)
        print(f"\n🔍 {all_terms} | {location} | {time_filter} | profile={profile_id}")
        all_jobs = []
        for term in all_terms:
            all_jobs.extend(do_scrape(term, location, hours_old, is_remote, results_n))
            if USAJOBS_KEY:
                all_jobs.extend(scrape_usajobs(term, location, is_remote, results=8))
        unique = dedupe(all_jobs)
        unique.sort(key=lambda x: x["daysAgo"])
        print(f"  ✅ {len(unique)} unique ({len(all_jobs)} raw)")
        return {"jobs": unique, "total": len(unique), "profile_id": profile_id}
    except Exception as e:
        import traceback; traceback.print_exc()
        return Response(
            content=json.dumps({"error": str(e), "jobs": [], "profile_id": body.get("profile_id","")}),
            status_code=500, media_type="application/json"
        )

@app.post("/db/jobs")
async def save_jobs(request: Request):
    body = await request.json()
    uid = get_uid(request, body)
    db_upsert_jobs(body.get("jobs", []), uid)
    return {"saved": len(body.get("jobs", []))}

@app.post("/db/status")
async def update_status(request: Request):
    body = await request.json()
    uid = get_uid(request, body)
    db_update_status(body["id"], body["status"], uid)
    return {"ok": True}

@app.post("/db/note")
async def update_note(request: Request):
    body = await request.json()
    uid = get_uid(request, body)
    db_update_note(body["id"], body["note"], uid)
    return {"ok": True}

@app.post("/db/profiles")
async def save_profiles(request: Request):
    body = await request.json()
    uid = get_uid(request, body)
    db_save_profiles(body.get("profiles", []), uid)
    return {"ok": True}

@app.post("/db/timeline")
async def add_timeline(request: Request):
    body = await request.json()
    uid = get_uid(request, body)
    tl = db_add_timeline(body["jobId"], body["type"], body.get("note",""), body.get("date",""), uid)
    return {"timeline": tl}

@app.post("/db/import")
async def import_data(request: Request):
    body = await request.json()
    uid = get_uid(request, body)
    db_import(body, uid)
    return {"ok": True}

@app.post("/create-checkout")
async def create_checkout(request: Request):
    body = await request.json()
    try:
        plan = body.get("plan", "monthly")
        user_id = body.get("userId", "")
        return_url = body.get("returnUrl", "https://rolefindr.vercel.app")
        price_id = PRICE_YEARLY if plan == "yearly" else PRICE_MONTHLY
        if not stripe.api_key:
            return Response(content=json.dumps({"error": "Stripe not configured"}), status_code=500, media_type="application/json")
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            mode="subscription",
            success_url=f"{return_url}?checkout=success",
            cancel_url=return_url,
            metadata={"user_id": user_id},
            client_reference_id=user_id,
        )
        return {"url": session.url}
    except Exception as e:
        return Response(content=json.dumps({"error": str(e)}), status_code=500, media_type="application/json")

@app.post("/webhook")
async def webhook(request: Request):
    try:
        body = await request.json()
        if body["type"] == "checkout.session.completed":
            session = body["data"]["object"]
            user_id = session.get("client_reference_id") or session.get("metadata", {}).get("user_id")
            if user_id:
                get_db().table("subscriptions").upsert({
                    "user_id": user_id, "is_pro": True, "plan": "pro",
                    "stripe_customer_id": session.get("customer", ""),
                    "stripe_subscription_id": session.get("subscription", ""),
                }).execute()
        elif body["type"] in ["customer.subscription.deleted", "customer.subscription.paused"]:
            sub = body["data"]["object"]
            cust_id = sub.get("customer")
            if cust_id:
                get_db().table("subscriptions").update(
                    {"is_pro": False, "plan": "free"}
                ).eq("stripe_customer_id", cust_id).execute()
    except: pass
    return {"ok": True}

@app.post("/api/claude")
async def claude_proxy(request: Request):
    body = await request.json()
    api_key = ENV.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return Response(content=json.dumps({"error": "Missing ANTHROPIC_API_KEY"}), status_code=500, media_type="application/json")
    try:
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps(body).encode(),
            headers={
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01"
            },
            method="POST"
        )
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except Exception as e:
        return Response(content=json.dumps({"error": str(e)}), status_code=500, media_type="application/json")

@app.post("/save-job")
async def extension_save(request: Request):
    body = await request.json()
    job = {
        "id": str(abs(hash(body.get("url","")+body.get("title","")))),
        "title": body.get("title","Untitled"),
        "company": body.get("company","Unknown"),
        "location": body.get("location",""),
        "salary": "Not listed", "salaryMax": 0,
        "source": "Extension",
        "workType": body.get("workType","Onsite"),
        "description": clean_description(body.get("description",""))[:2000],
        "url": body.get("url","#"),
        "datePosted": datetime.now().strftime("%Y-%m-%d"),
        "postedLabel": "Today", "daysAgo": 0, "status": "Saved",
        "remote": body.get("workType","")=="Remote",
        "profileId": body.get("profileId",""),
    }
    db_upsert_jobs([job])
    return {"ok": True, "job": job}

@app.delete("/db/jobs/{job_id}")
async def delete_job(job_id: str, request: Request):
    uid = get_uid(request)
    db_delete_job(job_id, uid)
    return {"ok": True}

@app.delete("/db/timeline/{ev_id}")
async def delete_timeline(ev_id: int, request: Request):
    uid = get_uid(request)
    db_delete_timeline_event(ev_id, uid)
    return {"ok": True}

if __name__ == "__main__":
    try:
        get_db().table("jobs").select("id").limit(1).execute()
        print("  ✅ Supabase connected!")
    except Exception as e:
        print(f"  ❌ Supabase connection failed: {e}")
    port = int(os.environ.get("PORT", 3002))
    print("="*60)
    print("  🚀 Rolefindr Server v9")
    print(f"  http://0.0.0.0:{port}")
    print(f"  USAJobs: {'✅' if USAJOBS_KEY else '⚠️  optional'}")
    print("="*60)
    uvicorn.run(app, host="0.0.0.0", port=port)
