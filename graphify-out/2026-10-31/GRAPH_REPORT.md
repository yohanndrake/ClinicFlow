# Graph Report - ClinicFlow  (2026-10-31)

## Corpus Check
- 28 files · ~23,063 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: .css 7, (none) 2, .example 1)

## Summary
- 613 nodes · 810 edges · 73 communities (62 shown, 11 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 84 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `12180149`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Server Code & Routes
- Package & Dependencies
- Database Schema
- Admin Reports Wireframe
- Mobile Ticket Called
- Mobile Ticket Near
- Admin Queue Records Wireframe
- Mobile Ticket Waiting
- Desktop Ticket Near
- Desktop Ticket Waiting
- Public Landing Page
- Admin Dashboard Wireframe
- Admin User Modals
- Admin Users Screen
- Desktop Ticket Called
- Visit History Desktop
- Patient Modals
- Staff Console States
- Staff Queue Records
- Notifications Desktop
- Admin Service Modal
- Admin Services Screen
- Clinic Settings
- Notifications Mobile
- Mobile Patient Home
- Mobile End States
- Mobile Visit History
- Mobile Bottom Sheets
- Desktop Patient Home
- Ticket Issued Desktop
- Public Board States
- Error Pages
- Staff Queue Console
- Staff Ticket Modals
- Staff Service Modals
- Graphify Tooling
- Mobile Edit Profile
- Mobile Take Number
- Desktop Take Number
- Desktop End States
- Login Desktop
- Register Desktop
- Now Serving Board
- Edit Profile Desktop
- Landing Notes
- Login Notes
- Mobile Ticket Issued
- Mobile Landing
- Mobile Login
- Mobile Register
- Register Notes
- Visit History Notes
- Change Password Notes
- End State Notes
- Patient Home Notes
- Take Number Notes
- Misc: Bottom sheet notes wireframe
- Misc: Alternate Called state (unchan
- Misc: Connection lost banner (note 1
- Misc: Account actions: Edit Profile,
- Misc: Conditional empty-state exampl
- Misc: Account menu actions: Edit Pro
- board.js
- index.js
- profile.js
- home.js

## God Nodes (most connected - your core abstractions)
1. `ticketLabel()` - 13 edges
2. `toId()` - 12 edges
3. `clinicNow()` - 11 edges
4. `getSettings()` - 11 edges
5. `checkNearAlerts()` - 10 edges
6. `statusChange()` - 9 edges
7. `ADM-02 Reports wireframe` - 9 edges
8. `tickets` - 8 edges
9. `express` - 8 edges
10. `expireTickets()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `graphify knowledge graph` --semantically_similar_to--> `graphify skill`  [INFERRED] [semantically similar]
  CLAUDE.md → .claude/CLAUDE.md
- `runExpiry()` --calls--> `expireTickets()`  [EXTRACTED]
  server/server.js → server/jobs.js
- `describeTicket()` --calls--> `ticketLabel()`  [EXTRACTED]
  server/routes/patient.js → server/helpers.js
- `lockTicket()` --calls--> `toId()`  [EXTRACTED]
  server/routes/admin.js → server/helpers.js
- `readAssignment()` --calls--> `toId()`  [EXTRACTED]
  server/routes/admin.js → server/helpers.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **ADM-02 report chart panels driven by date range** — docs_clinicflow_wireframes_adm_02_reports_tickets_per_day_chart, docs_clinicflow_wireframes_adm_02_reports_average_wait_chart, docs_clinicflow_wireframes_adm_02_reports_status_breakdown_chart, docs_clinicflow_wireframes_adm_02_reports_peak_hours_chart [EXTRACTED 1.00]
- **Users page modal set** — docs_clinicflow_wireframes_adm_04_user_modals_add_edit_staff_modal, docs_clinicflow_wireframes_adm_04_user_modals_reset_password_modal, docs_clinicflow_wireframes_adm_04_user_modals_deactivate_staff_modal, docs_clinicflow_wireframes_adm_04_user_modals_patient_detail_modal [EXTRACTED 1.00]
- **Users management: tabs, filter, table, shared staff form** — docs_clinicflow_wireframes_adm_04_users_staff_patients_tabs, docs_clinicflow_wireframes_adm_04_users_search_status_filter, docs_clinicflow_wireframes_adm_04_users_staff_table, docs_clinicflow_wireframes_adm_04_users_shared_staff_form [EXTRACTED 1.00]
- **Login error states** — docs_clinicflow_wireframes_login_notes_invalid_credentials_error, docs_clinicflow_wireframes_login_notes_account_deactivated_error, docs_clinicflow_wireframes_login_notes_too_many_attempts_error [EXTRACTED 1.00]
- **Patient ticket end states** — docs_clinicflow_wireframes_m_pat_03_end_states_completed_card, docs_clinicflow_wireframes_m_pat_03_end_states_skipped_card, docs_clinicflow_wireframes_m_pat_03_end_states_cancelled_card, docs_clinicflow_wireframes_m_pat_03_end_states_no_ticket_card [EXTRACTED 1.00]
- **Landing page sections** — docs_clinicflow_wireframes_m_pub_01_landing_hero_cta, docs_clinicflow_wireframes_m_pub_01_landing_service_queue_card, docs_clinicflow_wireframes_m_pub_01_landing_how_it_works [EXTRACTED 1.00]
- **My Ticket Near screen components** — docs_clinicflow_wireframes_m_pat_03_my_ticket_near_ticket_status_card, docs_clinicflow_wireframes_m_pat_03_my_ticket_near_now_serving, docs_clinicflow_wireframes_m_pat_03_my_ticket_near_keep_page_open_alerts, docs_clinicflow_wireframes_m_pat_03_my_ticket_near_im_here_action, docs_clinicflow_wireframes_m_pat_03_my_ticket_near_cancel_ticket_action [EXTRACTED 1.00]
- **My Ticket waiting screen components** — docs_clinicflow_wireframes_pat_03_my_ticket_waiting_ticket_card, docs_clinicflow_wireframes_pat_03_my_ticket_waiting_clinic_queue_panel, docs_clinicflow_wireframes_pat_03_my_ticket_waiting_notifications_prompt, docs_clinicflow_wireframes_pat_03_my_ticket_waiting_connection_lost_banner [EXTRACTED 1.00]
- **Patient Home dashboard panels** — docs_clinicflow_wireframes_pat_01_patient_home_active_ticket_card, docs_clinicflow_wireframes_pat_01_patient_home_service_status_card, docs_clinicflow_wireframes_pat_01_patient_home_latest_notifications, docs_clinicflow_wireframes_pat_01_patient_home_recent_visits [EXTRACTED 1.00]
- **My Ticket end-state outcomes** — docs_clinicflow_wireframes_pat_03_end_states_completed_card, docs_clinicflow_wireframes_pat_03_end_states_skipped_card, docs_clinicflow_wireframes_pat_03_end_states_expired_card, docs_clinicflow_wireframes_pat_03_end_states_no_active_ticket_card [EXTRACTED 1.00]
- **Patient mobile bottom sheet set** — docs_clinicflow_wireframes_m_pat_bottom_sheets_confirm_number_sheet, docs_clinicflow_wireframes_m_pat_bottom_sheets_cancel_ticket_sheet, docs_clinicflow_wireframes_m_pat_bottom_sheets_visit_detail_sheet, docs_clinicflow_wireframes_m_pat_bottom_sheets_notification_permission_sheet [EXTRACTED 1.00]
- **Patient modal specimens** — docs_clinicflow_wireframes_pat_modals_confirm_get_number_modal, docs_clinicflow_wireframes_pat_modals_confirm_cancel_ticket_modal, docs_clinicflow_wireframes_pat_modals_visit_detail_modal, docs_clinicflow_wireframes_pat_modals_notification_permission_modal [EXTRACTED 1.00]
- **PUB-01 landing page layout sections** — docs_clinicflow_wireframes_pub_01_landing_png_header_nav, docs_clinicflow_wireframes_pub_01_landing_png_hero_section, docs_clinicflow_wireframes_pub_01_landing_png_service_status_card, docs_clinicflow_wireframes_pub_01_landing_png_how_it_works, docs_clinicflow_wireframes_pub_01_landing_png_footer [EXTRACTED 1.00]
- **Error page variants sharing header and Back to home action** — docs_clinicflow_wireframes_pub_05_error_pages_404_not_found, docs_clinicflow_wireframes_pub_05_error_pages_403_access_denied, docs_clinicflow_wireframes_pub_05_error_pages_generic_error [EXTRACTED 1.00]
- **Public board non-active states** — docs_clinicflow_wireframes_pub_04_board_states_nobody_serving_state, docs_clinicflow_wireframes_pub_04_board_states_service_paused_state, docs_clinicflow_wireframes_pub_04_board_states_service_closed_state, docs_clinicflow_wireframes_pub_04_board_states_connection_lost_state [EXTRACTED 1.00]
- **Register form validation error states** — docs_clinicflow_wireframes_register_notes_email_already_used, docs_clinicflow_wireframes_register_notes_weak_password, docs_clinicflow_wireframes_register_notes_passwords_dont_match [EXTRACTED 1.00]
- **Staff console modals and drawer specimens** — docs_clinicflow_wireframes_stf_modals_2_delete_ticket_modal, docs_clinicflow_wireframes_stf_modals_2_pause_service_modal, docs_clinicflow_wireframes_stf_modals_2_close_for_the_day_modal, docs_clinicflow_wireframes_stf_modals_2_ticket_details_drawer [EXTRACTED 1.00]
- **Staff queue modal specimens** — docs_clinicflow_wireframes_stf_modals_1_add_walkin_modal, docs_clinicflow_wireframes_stf_modals_1_edit_ticket_modal, docs_clinicflow_wireframes_stf_modals_1_skip_or_cancel_modal [EXTRACTED 1.00]
- **Staff console alternate state specimens** — docs_clinicflow_wireframes_stf_01_console_states_png_loading_skeleton, docs_clinicflow_wireframes_stf_01_console_states_png_empty_queue, docs_clinicflow_wireframes_stf_01_console_states_png_paused_banner, docs_clinicflow_wireframes_stf_01_console_states_png_closed_banner, docs_clinicflow_wireframes_stf_01_console_states_png_conflict_toast, docs_clinicflow_wireframes_stf_01_console_states_png_connection_lost [EXTRACTED 1.00]
- **Queue timing configuration settings** — docs_clinicflow_wireframes_adm_06_clinic_settings_near_threshold, docs_clinicflow_wireframes_adm_06_clinic_settings_grace_period, docs_clinicflow_wireframes_adm_06_clinic_settings_default_travel_time [INFERRED 0.75]
- **My Ticket Called screen patient actions** — docs_clinicflow_wireframes_m_pat_03_my_ticket_called_im_here_action, docs_clinicflow_wireframes_m_pat_03_my_ticket_called_cancel_ticket_action, docs_clinicflow_wireframes_m_pat_03_my_ticket_called_keep_page_open_alerts [INFERRED 0.75]
- **ADM-01 dashboard metric views** — docs_clinicflow_wireframes_adm_01_dashboard_kpi_cards, docs_clinicflow_wireframes_adm_01_dashboard_tickets_per_day_chart, docs_clinicflow_wireframes_adm_01_dashboard_avg_wait_chart [INFERRED 0.85]
- **Visit History page composition** — docs_clinicflow_wireframes_pat_04_visit_history_filters, docs_clinicflow_wireframes_pat_04_visit_history_history_table, docs_clinicflow_wireframes_pat_04_visit_history_pagination, docs_clinicflow_wireframes_pat_04_visit_history_empty_state [INFERRED 0.85]
- **Queue Console core operational panels** — docs_clinicflow_wireframes_stf_01_queue_console_current_serving, docs_clinicflow_wireframes_stf_01_queue_console_call_next, docs_clinicflow_wireframes_stf_01_queue_console_queue_table, docs_clinicflow_wireframes_stf_01_queue_console_status_counters [INFERRED 0.85]
- **Visit History list view composition** — docs_clinicflow_wireframes_m_pat_04_visit_history_filters, docs_clinicflow_wireframes_m_pat_04_visit_history_visit_card, docs_clinicflow_wireframes_m_pat_04_visit_history_load_more, docs_clinicflow_wireframes_m_pat_04_visit_history_empty_state [INFERRED 0.85]

## Communities (73 total, 11 thin omitted)

### Community 0 - "Server Code & Routes"
Cohesion: 0.05
Nodes (69): pool, { Pool, types }, clinicNow(), crypto, csvCell(), daysBefore(), emailInUse(), fail() (+61 more)

### Community 1 - "Package & Dependencies"
Cohesion: 0.07
Nodes (32): author, bugs, url, dependencies, bcrypt@^6.0.0, express@^5.3.0, express-session@^1.19.0, pg@^8.23.1 (+24 more)

### Community 2 - "Database Schema"
Cohesion: 0.31
Nodes (13): admins, clinic_settings, idx_notifications_patient, idx_ticket_history_ticket, idx_tickets_date, idx_tickets_patient, notifications, patients (+5 more)

### Community 3 - "Admin Reports Wireframe"
Cohesion: 0.24
Nodes (10): Admin sidebar navigation (Dashboard, Reports, Services, Users, Queue Records, Settings), Average wait per day line chart, Date range filter, Export CSV button, No data for this range empty state, Peak hours bar chart, ADM-02 Reports wireframe, Status breakdown donut chart (+2 more)

### Community 4 - "Mobile Ticket Called"
Cohesion: 0.24
Nodes (10): M-PAT-03 My Ticket - Called (mobile wireframe), Bottom navigation (Home, Take a Number, My Ticket, History), Cancel ticket button, Header with clinic name, notifications, Sun/Moon theme toggle, user avatar, I'm here button (check-in), Keep this page open / Enable alerts panel, Now serving banner (G-010), Status stepper (Waiting, Near, Called, Done) (+2 more)

### Community 5 - "Mobile Ticket Near"
Cohesion: 0.24
Nodes (10): M-PAT-03 My Ticket - Near wireframe (mobile patient ticket screen, Near state), Bottom navigation (Home, Take a Number, My Ticket, History), Cancel ticket action, Header with clinic name, notifications bell, Sun/Moon theme toggle, user avatar, I'm here check-in action, Keep this page open panel with Enable alerts button, Now serving indicator (G-010), Status progress stepper (Waiting, Near, Called, Done) (+2 more)

### Community 6 - "Admin Queue Records Wireframe"
Cohesion: 0.28
Nodes (8): Admin Console Sidebar Navigation, Export CSV Action, Queue Records Filters (date range, status, search), Queue Records Table, ADM-05 Queue Records Screen, Show Deleted Toggle and Restore Action, Ticket Details Side Panel, Ticket Status (Waiting, Serving, Deleted)

### Community 7 - "Mobile Ticket Waiting"
Cohesion: 0.25
Nodes (9): M-PAT-03 My Ticket - Waiting wireframe, I'm here and Cancel ticket actions, Patient bottom navigation (Home, Take a Number, My Ticket, History), Keep this page open / Enable alerts card, Header with notification bell, Sun/Moon theme toggle, user avatar, Now serving banner (G-010), Queue position panel (Position 4, 3 ahead, about 15 min), Status stepper (Waiting, Near, Called, Done) (+1 more)

### Community 8 - "Desktop Ticket Near"
Cohesion: 0.28
Nodes (9): Clinic queue panel (Open, Now serving G-010, 6 waiting), PAT-03 My Ticket (Near state) wireframe, Near alert banner: Your turn is near, please head to the clinic, Keep this page open / Enable notifications panel, People ahead and estimated wait (2 ahead, about 8 min), Status stepper: Waiting, Near, Called, Done, Actions: I'm here, Cancel ticket, Ticket card G-014 General Consultation Room 1 (+1 more)

### Community 9 - "Desktop Ticket Waiting"
Cohesion: 0.25
Nodes (9): PAT-03 My Ticket - Waiting wireframe, Clinic queue panel (Now serving G-010, 6 waiting), Connection lost banner (conditional state), Keep this page open / Enable notifications panel, Patient top navigation (Home, Take a Number, My Ticket, History, theme toggle), Queue position and estimated wait (Position 4, about 15 min), Status stepper (Waiting, Near, Called, Done), Ticket actions (I'm here, Cancel ticket) (+1 more)

### Community 10 - "Public Landing Page"
Cohesion: 0.25
Nodes (9): Footer with clinic name and hours, Header navigation (Now Serving link, Sun/Moon theme toggle, Login, Register), Hero section: Your same-day clinic visit starts here, How it works steps (register, take a number, track your turn, get notified), PUB-01 Public Landing Page Wireframe, Sun/Moon light-dark theme toggle, General Consultation service status card (Open, now serving G-010, 6 waiting, 8:00 AM - 5:00 PM), Take a queue number CTA (+1 more)

### Community 11 - "Admin Dashboard Wireframe"
Cohesion: 0.32
Nodes (8): ADM-01 Admin Dashboard Wireframe, Average wait per day line chart (placeholder), Date range filter (Today, 7 days, 30 days), KPI summary cards (Total, Waiting, Completed, Skipped/Cancelled, Average wait), Live overview panel (General Consultation: now serving G-010, 6 waiting, hours), Admin sidebar navigation (Dashboard, Reports, Services, Users, Queue Records, Settings), Sun/Moon theme toggle, Tickets per day bar chart (placeholder)

### Community 12 - "Admin User Modals"
Cohesion: 0.29
Nodes (6): Add/Edit Staff modal, ADM-04 User Modals wireframe, Admin console layout (sidebar nav, Users active), Deactivate staff modal, Patient Detail modal (read-only), Reset Password modal

### Community 13 - "Admin Users Screen"
Cohesion: 0.29
Nodes (8): Admin Sidebar Navigation (Dashboard, Reports, Services, Users, Queue Records, Settings), Row Actions (Edit, Deactivate, Reset Password), ADM-04 Users Screen (Admin Console), Search and Status Filter, Shared Staff Form (Add Staff / Edit), Staff / Patients Tabs, Staff Table (Name, Email, Contact, Status, Assigned service, Counter, Created, Actions), Sun/Moon Theme Toggle

### Community 14 - "Desktop Ticket Called"
Cohesion: 0.29
Nodes (8): Called alert banner (go to Room 1, arrive within 09:30), Clinic queue panel (Now serving G-010, 6 waiting), Keep this page open panel with Enable notifications, PAT-03 My Ticket - Called wireframe, Patient top navigation (Home, Take a Number, My Ticket, History, theme toggle), Status stepper (Waiting, Near, Called, Done), Ticket actions (I'm here, Cancel ticket), Ticket card G-014 General Consultation Room 1

### Community 15 - "Visit History Desktop"
Cohesion: 0.32
Nodes (7): No Visit History Empty State, Date Range and Status Filters, Visit History Table (Date, Ticket number, Status, Wait time), Pagination (Previous / Next), Sun/Moon Theme Toggle, Patient Top Navigation (Home, Take a Number, My Ticket, History), PAT-04 Visit History Screen

### Community 16 - "Patient Modals"
Cohesion: 0.36
Nodes (8): Patient Modals Wireframe (PAT Modals), Confirm Cancel Ticket Modal, Confirm Get Number Modal, Notification Permission Modal, Patient Navigation Bar (Home, Take a Number, My Ticket, History), Queue Ticket (e.g. G-014 General Consultation), Sun/Moon Theme Toggle, Visit Detail Modal

### Community 17 - "Staff Console States"
Cohesion: 0.29
Nodes (8): STF-01 Console States wireframe, Closed banner (Service closed), Conflict toast (ticket already called), Connection lost state (updates paused), Empty queue state (No tickets waiting), Loading skeleton state, Paused banner (Service paused), Staff console (Queue Console, General Consultation Room 1)

### Community 18 - "Staff Queue Records"
Cohesion: 0.32
Nodes (7): STF-02 Queue Records wireframe, Filters: date range, status, search, General Consultation service (Room 1, 8AM-5PM), Pagination (Previous/Next), Queue records table (Number, Date, Name, Status, Wait time, Service time), Staff console sidebar (Queue Console, Queue Records), Sun/Moon theme toggle

### Community 19 - "Notifications Desktop"
Cohesion: 0.43
Nodes (7): All / Unread filter tabs, No notifications empty state, Header with theme toggle and user menu (Maria Santos), Mark all as read button, Notification List (unread highlighted gray), Notification types (turn near, ticket called, service paused, skipped, cancelled), ACC-04 Notifications Screen Wireframe

### Community 20 - "Admin Service Modal"
Cohesion: 0.33
Nodes (6): Add Service Modal, Admin Sidebar Navigation, Assigned Staff Multi-select, Service Configuration Fields (avg service time, daily ticket limit, opening/closing time, active), Admin Services Page, ADM-03 Service Modal Wireframe

### Community 21 - "Admin Services Screen"
Cohesion: 0.29
Nodes (6): Add Service Button and Search, ADM-03 Services Screen (Admin Console), Admin Sidebar Navigation (Dashboard, Reports, Services, Users, Queue Records, Settings), General Consultation Service (prefix G, 10 min, 8:00-5:00, Active, 2 staff), Services Table (Service, Prefix, Avg service time, Hours, Daily limit, Status, Staff count, Actions), Sun/Moon Theme Toggle

### Community 22 - "Clinic Settings"
Cohesion: 0.33
Nodes (7): Admin console shell (sidebar nav: Dashboard, Reports, Services, Users, Queue Records, Settings; Sun/Moon theme toggle), Default travel time (15 min design default), Grace period (minutes), Near threshold (people ahead), Save and Reset to defaults actions, ADM-06 Clinic Settings wireframe, Clinic settings form (clinic name, time zone, near threshold, grace period, default travel time)

### Community 23 - "Notifications Mobile"
Cohesion: 0.38
Nodes (7): No notifications empty state, All / Unread filter, Header: back, Sun/Moon theme toggle, MS avatar, Mark all read action, Notification list (unread highlighted), Queue notification types (turn near, being called, skipped, cancelled, service paused), M-ACC-04 Notifications Screen

### Community 24 - "Mobile Patient Home"
Cohesion: 0.38
Nodes (7): M-PAT-01 Patient Home (mobile wireframe), Active ticket card (G-014, Waiting, position 4, 3 ahead, ~15 min), Bottom tab navigation (Home, Take a Number, My Ticket, History), Header controls (notifications bell, Sun/Moon theme toggle, MS avatar), Latest alerts list, Recent visits list with View all, Service queue status card (General Consultation, Now serving G-010, 6 waiting)

### Community 25 - "Mobile End States"
Cohesion: 0.33
Nodes (7): Patient bottom navigation (Home, Take a Number, My Ticket, History), Cancelled ticket card (reason: Expired - end of day), Completed ticket card (G-014, wait/service time), Header with clinic name, notifications bell, Sun/Moon theme toggle, user avatar, No ticket state with Take a Number, M-PAT-03 End States Wireframe (patient mobile), Skipped ticket card with Take new number

### Community 26 - "Mobile Visit History"
Cohesion: 0.38
Nodes (7): Bottom tab nav (Home, Take a Number, My Ticket, History), No visits yet empty state, Date range and Status filters, Header with notifications, Sun/Moon theme toggle, MS avatar, Load more pagination button, M-PAT-04 Visit History mobile screen, Visit card (Date, Number, Status, Wait)

### Community 27 - "Mobile Bottom Sheets"
Cohesion: 0.33
Nodes (7): M-PAT Bottom Sheets Wireframe, App header (notifications bell, Sun/Moon theme toggle, MS avatar), Cancel ticket bottom sheet (G-014, Cancel ticket/Keep ticket), Confirm number bottom sheet (General Consultation, Confirm/Cancel), Notification permission bottom sheet (Allow/Not now), Patient bottom nav (Home, Take a Number, My Ticket, History), Visit detail bottom sheet (Taken, Called, Completed, Reason)

### Community 28 - "Desktop Patient Home"
Cohesion: 0.38
Nodes (6): Active Ticket Card (G-014, Position 4, est. wait 15 min, View ticket), Latest Notifications Panel, PAT-01 Patient Home Screen, Recent Visits Table (placeholder, historical data not supplied), Service Status Card (General Consultation: now serving, queue, hours), Top Navigation (Home, Take a Number, My Ticket, History, notifications, theme toggle)

### Community 29 - "Ticket Issued Desktop"
Cohesion: 0.33
Nodes (7): General Consultation service, Patient Top Navigation Bar (Home, Take a Number, My Ticket, History, theme toggle), Position and Estimated Wait Display, Queue Number G-014, PAT-02 Ticket Issued Screen, Ticket Issued Confirmation Card, View my ticket button

### Community 30 - "Public Board States"
Cohesion: 0.33
Nodes (7): PUB-04 Board States wireframe, Board state: Connection lost, General Consultation service, Board state: Nobody serving, Board state: Service closed, Board state: Service paused, Sun/Moon theme toggle

### Community 31 - "Error Pages"
Cohesion: 0.43
Nodes (7): PUB-05 Error Pages wireframe, 403 Access Denied page, 404 Not Found page, Back to home button, ClinicFlow Clinic header bar, Something went wrong page, Sun/Moon theme toggle

### Community 32 - "Staff Queue Console"
Cohesion: 0.38
Nodes (7): Call Next button, Current Serving panel (G-010 Juan Dela Cruz, Complete/Skip/Cancel/Re-announce, grace countdown), STF-01 Queue Console wireframe, Queue table with status tabs, search, and row actions (Details/Edit/Cancel/Delete/Recall), Service controls (Add Walk-in, Pause Service, Close for the Day), Staff console shell (sidebar nav, Sun/Moon theme toggle, auto-refresh, service switcher note), Status counters (Waiting, Serving, Completed, Skipped, Cancelled)

### Community 33 - "Staff Ticket Modals"
Cohesion: 0.38
Nodes (7): Add Walk-in Modal, Edit Ticket Modal (G-014), Priority Toggle, Skip/Cancel Reason Field, Skip or Cancel Modal, Staff Console Shell (Queue Console, Queue Records nav), Staff Modals Wireframe Screen (General Consultation, Room 1)

### Community 34 - "Staff Service Modals"
Cohesion: 0.38
Nodes (7): Close for the Day modal (cancels waiting tickets), Delete Ticket modal (required reason, excluded from reports), General Consultation service (Room 1, 8AM-5PM), Pause Service modal (optional reason shown on board), Staff console shell (Queue Console / Queue Records nav, Sun/Moon theme toggle), Staff modals and ticket details wireframe, Ticket Details drawer (G-014 timestamps, durations, status history)

### Community 35 - "Graphify Tooling"
Cohesion: 0.33
Nodes (4): graphify skill, /graphify trigger, GRAPH_REPORT.md, graphify knowledge graph

### Community 36 - "Mobile Edit Profile"
Cohesion: 0.40
Nodes (6): M-ACC-01 Edit Profile (mobile wireframe), User avatar initials badge (MS), Back arrow button, Edit Profile form: Full name, Contact, read-only Email and Role, Save, Saved confirmation banner, Sun/Moon theme toggle

### Community 37 - "Mobile Take Number"
Cohesion: 0.40
Nodes (5): M-PAT-02 Take a Number (mobile patient wireframe), Bottom navigation (Home, Take a Number, My Ticket, History), Header with notifications bell, Sun/Moon theme toggle, user avatar, General Consultation service card (Open, 8:00 AM - 5:00 PM, 6 waiting, ~15 min), Ticket request form (optional note 0/100, travel time, Get my number)

### Community 38 - "Desktop Take Number"
Cohesion: 0.47
Nodes (5): Active ticket banner (conditional, View ticket G-014), PAT-02 Take a Queue Number wireframe, Patient top navigation (Home, Take a Number, My Ticket, History, theme toggle), Selected service card (General Consultation, est. wait, queue, hours), Summary panel (optional note, travel time, Get my number)

### Community 39 - "Desktop End States"
Cohesion: 0.40
Nodes (6): Completed ticket card (wait/service time not supplied), Cancelled or Expired ticket card (expired end of day), No active ticket empty state with Take a Number, Patient top navigation (Home, Take a Number, My Ticket, History, theme toggle), PAT-03 My Ticket End States wireframe, Skipped ticket card with Take a new number action

### Community 40 - "Login Desktop"
Cohesion: 0.33
Nodes (4): PUB-02 Login wireframe, Login form card (email, password with show/hide, login button), Public header (ClinicFlow Clinic, Now Serving, Sun/Moon theme toggle, Login, Register), Register link (no account)

### Community 41 - "Register Desktop"
Cohesion: 0.33
Nodes (5): PUB-03 Register wireframe, Already have an account? Login link, Public header nav (ClinicFlow Clinic, Now Serving, Sun/Moon theme toggle, Login, Register), Registration form (full name, email, optional contact number, password, confirm password), Sun/Moon theme toggle

### Community 42 - "Now Serving Board"
Cohesion: 0.40
Nodes (5): PUB-04 Now Serving Board wireframe, Header: clock, theme toggle, full screen, Next up queue (G-011 to G-015, 6 waiting), Now serving ticket G-010 (Room 1), General Consultation service panel (Open status)

### Community 43 - "Edit Profile Desktop"
Cohesion: 0.40
Nodes (5): Edit Profile form (Full name, Contact number editable; Email, Role read-only), Header nav with Sun/Moon theme toggle and user menu (Edit Profile, Change Password, Logout), ACC-01 Edit Profile wireframe, Success toast: Profile updated successfully, User identity block (MS avatar, Maria Santos, Patient)

### Community 44 - "Landing Notes"
Cohesion: 0.40
Nodes (5): Landing page menu (Now Serving, Login, Register), Landing notes: menu annotation, Login, Now Serving, Register

### Community 45 - "Login Notes"
Cohesion: 0.60
Nodes (5): Login notes (wireframe annotations), Account deactivated error, Invalid credentials error, Menu: Now Serving, Login, Register, Too many attempts error

### Community 46 - "Mobile Ticket Issued"
Cohesion: 0.40
Nodes (5): Patient bottom navigation (Home, Take a Number, My Ticket, History), Header bar (clinic name, notifications, Sun/Moon theme toggle, user avatar), M-PAT-02 Ticket Issued screen (mobile wireframe), Ticket card (G-014, General Consultation, Position 4, About 15 min), View my ticket button

### Community 47 - "Mobile Landing"
Cohesion: 0.50
Nodes (5): M-PUB-01 Landing (mobile public landing wireframe), Header with Sun/Moon theme toggle and menu, Hero: Your clinic visit starts here, with Take a number and Now Serving buttons, How it works: Register, Take a number, Track your turn, Get notified, General Consultation queue card (Open, now serving G-010, 6 waiting)

### Community 48 - "Mobile Login"
Cohesion: 0.40
Nodes (4): M-PUB-02 Login mobile wireframe, Header with ClinicFlow Clinic title, Sun/Moon theme toggle, hamburger menu, Login form (email, password with Show/Hide, Login button), Register link

### Community 49 - "Mobile Register"
Cohesion: 0.50
Nodes (5): M-PUB-03 Register (mobile wireframe), Login link (existing account), Mobile header with ClinicFlow Clinic brand and hamburger menu, Registration form (full name, email, optional contact, password, confirm password, Register button), Sun/Moon theme toggle

### Community 50 - "Register Notes"
Cohesion: 0.50
Nodes (5): Register screen wireframe notes, Error state: Email already used, Menu: Now Serving, Login, Register, Error state: Passwords don't match, Error state: Weak password

### Community 51 - "Visit History Notes"
Cohesion: 0.50
Nodes (5): Visit History Wireframe Notes, Conditional empty-state example, Historical visit data not supplied, Edit Profile, Change Password, Logout, Service filter appears with more services

### Community 52 - "Change Password Notes"
Cohesion: 0.50
Nodes (4): Change Password Notes, Logs out after saving, Passwords don't match, Wrong current password

### Community 53 - "End State Notes"
Cohesion: 0.50
Nodes (4): Alternate outcome examples, Durations not supplied, End state notes (wireframe annotations), Edit Profile, Change Password, Logout

### Community 54 - "Patient Home Notes"
Cohesion: 0.50
Nodes (4): Patient Home Wireframe Notes, Empty state shows Take a number, No historical visit data supplied, Edit Profile, Change Password, Logout

### Community 55 - "Take Number Notes"
Cohesion: 0.50
Nodes (4): Take a Number wireframe notes, Banner if patient has active ticket, Card greys out when paused or closed, Edit Profile, Change Password, Logout

### Community 56 - "Misc: Bottom sheet notes wireframe"
Cohesion: 0.67
Nodes (3): Bottom sheet notes wireframe, Edit Profile, Change Password, Logout sheet, Static sheet examples (opened separately)

### Community 57 - "Misc: Alternate Called state (unchan"
Cohesion: 0.67
Nodes (3): Alternate Called state (unchanged G-010 snapshot), Called ticket notes wireframe annotations, Edit Profile, Change Password, Logout

### Community 58 - "Misc: Connection lost banner (note 1"
Cohesion: 0.67
Nodes (3): Connection lost banner (note 1), Profile menu: Edit Profile, Change Password, Logout (note 3), Waiting Ticket Wireframe Notes

### Community 63 - "board.js"
Cohesion: 0.28
Nodes (10): announceNewNumbers(), boardState(), draw(), drawOpenService(), drawService(), el(), formatTime(), refresh() (+2 more)

### Community 65 - "index.js"
Cohesion: 0.33
Nodes (7): cardState(), drawService(), el(), fact(), formatTime(), loadQueue(), showFooterHours()

### Community 72 - "home.js"
Cohesion: 0.19
Nodes (15): capitalize(), drawService(), el(), fact(), formatDay(), formatTime(), getJson(), loadAll() (+7 more)

## Knowledge Gaps
- **169 isolated node(s):** `Sun/Moon light-dark theme toggle`, `Footer with clinic name and hours`, `How it works steps (register, take a number, track your turn, get notified)`, `Take a queue number CTA`, `Live overview panel (General Consultation: now serving G-010, 6 waiting, hours)` (+164 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 290 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `Package & Dependencies` to `Server Code & Routes`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `ticketLabel()` (e.g. with `helpers.js` and `public.js`) actually correct?**
  _`ticketLabel()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Sun/Moon light-dark theme toggle`, `Footer with clinic name and hours`, `How it works steps (register, take a number, track your turn, get notified)` to the rest of the system?**
  _169 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Server Code & Routes` be split into smaller, more focused modules?**
  _Cohesion score 0.05422838031533684 - nodes in this community are weakly interconnected._
- **Why does `bcrypt` connect `Package & Dependencies` to `Server Code & Routes`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Should `Package & Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06554621848739496 - nodes in this community are weakly interconnected._