# ClinicFlow

## 1. Project Title

**ClinicFlow**: a queue management system for the school clinic.

## 2. Description

ClinicFlow is a web app that manages the school clinic's same-day queue. Patients take a number online and watch their place in line live, so they don't have to stand in the waiting area. Clinic staff call, complete, skip and recall tickets from a queue console. Admins manage services, users and clinic settings, and view reports.

The system has three roles, **Patient**, **Staff** and **Admin**, plus a public **Now Serving** board that can be shown on a TV in the clinic.

## 3. Features

**Patient**
- Register and log in (first and last name, email, optional contact number)
- Take a queue number for a clinic service
- Live ticket page showing the current number, people ahead and estimated wait
- Alerts when their turn is near, plus an "I'm here" check-in with a grace countdown
- Notifications and visit history (last 7 or 30 days)

**Staff**
- Queue console: call next, complete, skip, recall, add walk-ins and mark tickets as priority
- Pause or close the queue
- Soft delete and restore tickets
- Queue records with filters

**Admin**
- Dashboard with today's numbers and charts
- Reports with charts
- Manage services (hours, daily limit, average service time)
- Manage staff, patient and admin accounts (add, edit, deactivate, reset password)
- Queue records and clinic settings

**General**
- Public Now Serving board
- Light and dark theme
- Edit profile and change password; users given a temporary password must change it at first login
- Security: bcrypt password hashing, sessions stored in the database, login lockout after repeated failed attempts, and a Content Security Policy

## 4. Technologies

- HTML5
- CSS3 (custom design system, no CSS framework)
- JavaScript (ES6+)
- Fetch API
- Node.js 24
- Express 5
- express-session
- bcrypt
- node-postgres (pg)
- PostgreSQL (hosted on Supabase)
- Chart.js 4.4.1
- Render (hosting)
- Git / GitHub

## 5. Installation Instructions

**Requirements:** Node.js 24 or newer, Git, and a PostgreSQL database (see section 6).

1. Clone the repository:
   ```bash
   git clone https://github.com/yohanndrake/ClinicFlow.git
   cd ClinicFlow
   ```
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env`, then fill in your own values:
   ```
   DATABASE_URL=postgresql://user:password@host:5432/postgres
   SESSION_SECRET=any-long-random-string
   ```
   Optional settings:
   - `PORT`: the port to run on (default 3000)
   - `DATABASE_CA_FILE`: path to the database's CA certificate, to verify the TLS connection
   - `TRUST_PROXY=1`: set this when running behind a proxy
4. Set up the database (section 6).
5. Start the server:
   ```bash
   npm run dev     # development, restarts when files change
   npm start       # production
   ```
6. Open http://localhost:3000 in your browser.

Never commit the `.env` file. It holds your database password and session secret.

## 6. Database Setup

ClinicFlow uses PostgreSQL. These steps use Supabase, but any PostgreSQL database works.

1. Create a free project at [supabase.com](https://supabase.com).
2. In the project, open **SQL Editor**.
3. Paste the contents of `database/schema.sql` and run it. This creates the tables: `patients`, `staff`, `admins`, `clinic_settings`, `services`, `staff_services`, `tickets`, `ticket_history`, `notifications` and `sessions`.
4. *(Optional, demo or testing only)* Paste and run `database/seed.sql` to add sample services and demo accounts. Every demo account must change its password at first login. Don't load the seed data into a real live database.
5. Click **Connect** in Supabase and copy the **Session pooler** connection string. Put it in `.env` as `DATABASE_URL`, with your database password filled in.

**Note:** `schema.sql` drops and re-creates the tables, so running it again deletes all existing data.

## 7. Screenshots

| Screen | Screenshot |
|---|---|
| Landing page | ![Landing page](docs/screenshots/LandingPage_.png) |
| Login | ![Login](docs/screenshots/LoginPage.png) |
| Patient: Home | ![Patient home](docs/screenshots/PatientPage.png) |
| Staff: Queue console | ![Queue console](docs/screenshots/StaffPage.png) |
| Admin: Dashboard | ![Admin dashboard](docs/screenshots/AdminDashboardPage.png) |
| Admin: Reports | ![Reports](docs/screenshots/AdminReportsPage.png) |
| Now Serving board | ![Now Serving](docs/screenshots/NowServingBoardPage.png) |

The original wireframes are in `docs/ClinicFlow Wireframes/`.

## 8. Live Demo

**https://clinicflow-ph.onrender.com/**

The app is hosted on Render's free plan. If no one has visited it for a while, the first page load can take up to a minute while the server wakes up.

## 9. Developers

| Name | Contributions |
|---|---|
| Yohann Drake Jamisola | Full-stack development: database design, back-end API, front-end pages, deployment |
