# JobPilot 🚀
**Your personal job-hunting dashboard** — Silver Spring, MD

---

## ⚡ OPTION 1 — Run Locally on Your Laptop

### Step 1: Install Node.js (one-time, free)
1. Go to → **https://nodejs.org**
2. Click the big green **"LTS"** download button
3. Run the installer — click Next through everything, keep all defaults
4. When done, open **Terminal** (Mac) or **Command Prompt** (Windows)
5. Type `node --version` and press Enter — you should see a version number like `v20.x.x`

### Step 2: Set up JobPilot
Open Terminal / Command Prompt and run these commands **one at a time**:

```bash
# 1. Go into the jobpilot folder (adjust path to wherever you saved it)
cd ~/Downloads/jobpilot

# 2. Install dependencies (takes ~1 minute, internet required)
npm install

# 3. Launch the app!
npm start
```

✅ Your browser will automatically open **http://localhost:3000** with JobPilot running!

**To stop it:** Press `Ctrl + C` in the terminal.  
**To restart it:** Just run `npm start` again from the jobpilot folder.

---

## 🌐 OPTION 2 — Host as a Free Web App (accessible from any device)

You'll need the jobpilot folder on your laptop first (complete Option 1 Step 1 & 2 above), then:

### Step 1: Create a free Vercel account
1. Go to → **https://vercel.com**
2. Click **"Sign Up"** → sign up with your **GitHub account** (or create a free GitHub account first at github.com)

### Step 2: Push your code to GitHub
In your terminal (from inside the jobpilot folder):

```bash
# Initialize git
git init
git add .
git commit -m "JobPilot initial launch"

# Create a new repo on GitHub:
# → Go to github.com → click "+" → "New repository"
# → Name it "jobpilot" → click "Create repository"
# → Copy the two lines GitHub shows you that start with "git remote add origin..."

git remote add origin https://github.com/YOUR_USERNAME/jobpilot.git
git push -u origin main
```

### Step 3: Deploy to Vercel (2 clicks)
1. Go to → **https://vercel.com/dashboard**
2. Click **"Add New → Project"**
3. Find your **"jobpilot"** repo and click **"Import"**
4. Leave all settings as-is → click **"Deploy"**
5. Wait ~60 seconds → 🎉 You'll get a live URL like **`jobpilot.vercel.app`**

That URL works on any device — laptop, phone, tablet — forever, for free.

---

## 🔧 Troubleshooting

| Problem | Fix |
|---|---|
| `npm: command not found` | Node.js didn't install correctly — try reinstalling from nodejs.org |
| `npm install` fails | Make sure you're inside the `jobpilot` folder |
| App opens but looks broken | Clear browser cache (Ctrl+Shift+R) |
| Vercel deploy fails | Make sure `npm run build` works locally first |

---

## 📬 Next Steps (Option 3 — Live Job Data)

Once you're up and running, we can connect real job board APIs:
- **Indeed Publisher API** — pulls live job listings
- **ZipRecruiter API** — has a partner program
- **LinkedIn** — more restricted, requires scraping workaround
- **Glassdoor API** — available for non-commercial use

Come back to Claude and say "let's do Option 3" and we'll wire it up!

---

*Built with React · Powered by Claude AI*
