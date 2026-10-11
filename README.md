# SafeNet — Online Safety for Everyone

## V18 — Full online-safety learning platform

SafeNet is an all-ages online-safety awareness and practice platform for children, adolescents, school students, college students, working professionals, general citizens, senior citizens, parents and educators. V18 keeps the existing 3D marble / skin-colour luxury visual language, SafeNet learning content and 83-scenario Scenario Lab, and adds the requested learning, account and administration systems.

### Existing features preserved
- 83 interactive safety scenarios with search/filter/progress
- 3D Learning Hub
- Safety Knowledge Center / threat library / quick safety rules
- Topic-matched YouTube learning links with direct external launch (no iframe embeds)
- Existing audience cards and SafeNet visual theme
- Creator: **Supraj Sunil Panchal — Roll No. 72**
- Authenticated Admin Login → control panel → Logout → direct return to main page
- Feedback storage and admin review

### New V18 features
- Audience Safety Paths: children 2–12, adolescents 13–19, school students, college students, professionals, senior citizens, parents/educators, everyone
- Interactive Safety Simulator
- Scam Awareness Library with filters
- Phishing Lab
- Local-only Password Safety Checker
- Digital Footprint Lab
- Safe Gaming Zone
- Parent & Educator Center
- Learning Library with admin-controlled lessons/videos and lesson completion
- Knowledge Quiz with 18 questions and signed-in progress sync
- User registration/login + personal dashboard
- Secure password hashing with Node.js `crypto.scrypt`
- Admin never receives or displays user password hashes
- User password change and admin-forced password reset flag
- Progress dashboard for lessons, scenarios and quizzes
- Printable SafeNet awareness certificate after sufficient activity
- Help & Reporting center with official India reporting links
- SafeNet practice-report workflow for Admin review
- Expanded Admin CRUD for users, scenarios, learning content, quizzes, feedback, practice reports, announcements, site settings, certificates and audit log
- Admin credential change stored as a secure hash in `backend/data/admin.json`
- Safe JSON export that excludes password hashes

### Run in VS Code / Windows
1. Install Node.js LTS.
2. Open the extracted project folder in VS Code.
3. In the terminal:

```powershell
cd backend
npm.cmd install
npm.cmd start
```

4. Open **http://localhost:5000/**.

The full-stack Admin and user systems require the Node.js backend. Do not rely on opening the standalone HTML file for authenticated features.

### Default local demo Admin login
```text
ID: admin
Password: SafeNet@2026
```

Change it from **Admin → Security** or set environment variables before first start.

### Important password design
Real user passwords are **not stored inside `index.html`** and are never shown to administrators. The backend stores a one-way scrypt password hash in `backend/data/users.json`. Admin API responses remove that field before sending user data to the Admin Panel and export.

### Data files
- `backend/data/users.json` — user profile records + password hashes
- `backend/data/scenarios.json` — Scenario Lab
- `backend/data/resources.json` — learning videos and lessons
- `backend/data/quizzes.json` — quiz bank
- `backend/data/feedback.json` — feedback
- `backend/data/reports.json` — SafeNet practice reports
- `backend/data/certificates.json` — issued certificate records
- `backend/data/announcements.json` — public announcements
- `backend/data/audit.json` — admin/user action history
- `backend/data/settings.json` — public site settings
- `backend/data/admin.json` — admin username + password hash

### Admin flow
**Main page → Admin Login → successful login → full control panel → make changes → Log out → Main page.**

The URL `admin.html?login=1` explicitly forces the login screen and clears an old session token before authentication, so the dashboard cannot appear under the login form.

### Video blocking fix
The public website uses **direct YouTube launch cards instead of embedded YouTube iframes**. This avoids the blocked embedded-player frame shown in some VS Code/ChatGPT/browser previews while keeping the videos accessible through YouTube.

### India reporting resources
The Help & Reporting section links to the Government of India National Cyber Crime Reporting Portal (`cybercrime.gov.in`), the 1930 cybercrime helpline guidance, and CERT-In awareness material. SafeNet practice reports are explicitly labeled as educational records and are not government complaints.


V19 FIX: index.html and index-standalone.html now embed the base CSS so the 3D marble/skin design remains visible when either file is opened directly. The standalone page also inlines its frontend JS modules.
