#!/usr/local/bin/python3
"""
Rolefindr Server v8 — Added ZipRecruiter, Glassdoor, USAJobs
"""

from jobspy import scrape_jobs
import pandas as pd
from http.server import HTTPServer, BaseHTTPRequestHandler
import json, os, re, html, urllib.request, urllib.parse
from datetime import datetime
from supabase import create_client
import stripe

PORT = 3002

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

def get_db():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise Exception("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def init_db():
    try:
        get_db().table("jobs").select("id").limit(1).execute()
        print("  ✅ Supabase connected!")
    except Exception as e:
        print(f"  ❌ Supabase connection failed: {e}")

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
        boards = ["linkedin", "indeed", "zip_recruiter"]
        params = dict(
            site_name=boards,
            search_term=search_term,
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
    db = get_db()
    rows = db.table("jobs").select("data,status,note").eq("user_id", user_id)\
             .order("saved_at", desc=True).execute()
    out = []
    for r in rows.data:
        try:
            job = r["data"] if isinstance(r["data"], dict) else json.loads(r["data"])
            job["status"] = r["status"]
            job["note"] = r["note"] or ""
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

class JobHandler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin","*")
        self.send_header("Access-Control-Allow-Methods","GET,POST,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers","Content-Type,X-User-Id")

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_GET(self):
        uid = self.headers.get("X-User-Id","")
        if   self.path == "/db/jobs":               self._respond(200, {"jobs": db_load_all_jobs(uid)})
        elif self.path == "/db/profiles":            self._respond(200, {"profiles": db_load_profiles(uid)})
        elif self.path.startswith("/db/timeline/"): self._respond(200, {"timeline": db_get_timeline(self.path.split("/")[-1], uid)})
        elif self.path == "/db/export":             self._respond(200, db_export(uid))
        elif self.path == "/ping":                  self._respond(200, {"ok": True})
        else: self.send_response(404); self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length",0))
        body = json.loads(self.rfile.read(length)) if length else {}
        uid = self.headers.get("X-User-Id","") or body.get("userId","")
        if   self.path == "/search":            self._search(body, uid)
        elif self.path == "/db/jobs":           db_upsert_jobs(body.get("jobs",[]), uid); self._respond(200,{"saved":len(body.get("jobs",[]))})
        elif self.path == "/db/status":         db_update_status(body["id"],body["status"],uid); self._respond(200,{"ok":True})
        elif self.path == "/db/note":           db_update_note(body["id"],body["note"],uid); self._respond(200,{"ok":True})
        elif self.path == "/db/profiles":       db_save_profiles(body.get("profiles",[]),uid); self._respond(200,{"ok":True})
        elif self.path == "/db/timeline":       self._respond(200,{"timeline": db_add_timeline(body["jobId"],body["type"],body.get("note",""),body.get("date",""),uid)})
        elif self.path == "/db/import":         db_import(body,uid); self._respond(200,{"ok":True})
        elif self.path == "/create-checkout":   self._create_checkout(body)
        elif self.path == "/webhook":           self._handle_webhook()
        elif self.path == "/api/claude":        self._handle_claude(body)
        elif self.path == "/save-job":          self._extension_save(body)
        else: self.send_response(404); self.end_headers()

    def do_DELETE(self):
        uid = self.headers.get("X-User-Id","")
        parts = self.path.split("/")
        if   self.path.startswith("/db/jobs/"):     db_delete_job(parts[-1], uid); self._respond(200,{"ok":True})
        elif self.path.startswith("/db/timeline/"): db_delete_timeline_event(int(parts[-1]), uid); self._respond(200,{"ok":True})
        else: self.send_response(404); self.end_headers()

    def _search(self, params, uid=""):
        try:
            location     = params.get("location","Silver Spring, MD")
            search_term  = params.get("search_term","")
            search_terms = params.get("search_terms",[])
            time_filter  = params.get("time_filter","week")
            results_n    = params.get("results", 10)
            is_remote    = params.get("remote", False)
            profile_id   = params.get("profile_id", "")
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
            self._respond(200, {"jobs": unique, "total": len(unique), "profile_id": profile_id})
            print(f"  ✅ {len(unique)} unique ({len(all_jobs)} raw)")
        except Exception as e:
            import traceback; traceback.print_exc()
            self._respond(500, {"error": str(e), "jobs": [], "profile_id": params.get("profile_id","")})

    def _create_checkout(self, body):
        try:
            plan = body.get("plan", "monthly")
            user_id = body.get("userId", "")
            return_url = body.get("returnUrl", "https://rolefindr.vercel.app")
            price_id = PRICE_YEARLY if plan == "yearly" else PRICE_MONTHLY
            if not stripe.api_key:
                self._respond(500, {"error": "Stripe not configured"}); return
            if not price_id:
                self._respond(500, {"error": "Price ID not configured"}); return
            session = stripe.checkout.Session.create(
                payment_method_types=["card"],
                line_items=[{"price": price_id, "quantity": 1}],
                mode="subscription",
                success_url=f"{return_url}?checkout=success",
                cancel_url=return_url,
                metadata={"user_id": user_id},
                client_reference_id=user_id,
            )
            self._respond(200, {"url": session.url})
        except Exception as e:
            self._respond(500, {"error": str(e)})

    def _handle_webhook(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = self.rfile.read(length)
            event = json.loads(payload)
            if event["type"] == "checkout.session.completed":
                session = event["data"]["object"]
                user_id = session.get("client_reference_id") or session.get("metadata", {}).get("user_id")
                if user_id:
                    get_db().table("subscriptions").upsert({
                        "user_id": user_id, "is_pro": True, "plan": "pro",
                        "stripe_customer_id": session.get("customer", ""),
                        "stripe_subscription_id": session.get("subscription", ""),
                    }).execute()
            elif event["type"] in ["customer.subscription.deleted", "customer.subscription.paused"]:
                sub = event["data"]["object"]
                cust_id = sub.get("customer")
                if cust_id:
                    get_db().table("subscriptions").update(
                        {"is_pro": False, "plan": "free"}
                    ).eq("stripe_customer_id", cust_id).execute()
            self._respond(200, {"ok": True})
        except Exception as e:
            self._respond(200, {"ok": True})

    def _handle_claude(self, body):
        api_key = ENV.get("ANTHROPIC_API_KEY", "")
        if not api_key:
            self._respond(500, {"error": "Missing ANTHROPIC_API_KEY"}); return
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
                self._respond(200, json.loads(r.read()))
        except Exception as e:
            self._respond(500, {"error": str(e)})

    def _extension_save(self, body):
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
        self._respond(200, {"ok":True,"job":job})

    def _respond(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code); self._cors()
        self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",len(body))
        self.end_headers(); self.wfile.write(body)

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 3002))
    print("="*60)
    print("  🚀 Rolefindr Server v8")
    print(f"  http://0.0.0.0:{port}")
    print(f"  Job boards: LinkedIn · Indeed · ZipRecruiter")
    print(f"  USAJobs: {'✅ configured' if USAJOBS_KEY else '⚠️  optional - add key to enable'}")
    print("="*60)
    try: HTTPServer(("0.0.0.0", port), JobHandler).serve_forever()
    except KeyboardInterrupt: print("\n👋 Stopped.")
