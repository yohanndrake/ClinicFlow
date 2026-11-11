--demo data. Every demo account shares one known password, so each one must change it at first login.
--do not load this file into a live database: anyone who knows the demo password could log in first.
INSERT INTO admins (full_name, email, password_hash, contact_number, must_change_password) VALUES
('System Admin', 'admin@clinicflow.com', '$2b$10$tHRiey5G1TshSjslsYtLiOdkVjNLbioazY7bd3fvzGu4w6UHKUXDi', '1234567890', TRUE);

INSERT INTO staff (full_name, email, password_hash, contact_number, must_change_password) VALUES
('Dr. Staff One', 'staff1@clinicflow.com', '$2b$10$tHRiey5G1TshSjslsYtLiOdkVjNLbioazY7bd3fvzGu4w6UHKUXDi', '1112223333', TRUE),
('Dr. Staff Two', 'staff2@clinicflow.com', '$2b$10$tHRiey5G1TshSjslsYtLiOdkVjNLbioazY7bd3fvzGu4w6UHKUXDi', '4445556666', TRUE);

INSERT INTO patients (full_name, email, password_hash, contact_number, must_change_password) VALUES
('John Doe',   'john@example.com', '$2b$10$tHRiey5G1TshSjslsYtLiOdkVjNLbioazY7bd3fvzGu4w6UHKUXDi', '5550001111', TRUE),
('Jane Smith', 'jane@example.com', '$2b$10$tHRiey5G1TshSjslsYtLiOdkVjNLbioazY7bd3fvzGu4w6UHKUXDi', '5550002222', TRUE),
('Bob Wilson', 'bob@example.com',  '$2b$10$tHRiey5G1TshSjslsYtLiOdkVjNLbioazY7bd3fvzGu4w6UHKUXDi', '5550003333', TRUE);

INSERT INTO services (service_name, prefix, description, avg_service_minutes, open_time, close_time, daily_limit) VALUES
('General Consultation', 'G', 'Standard checkup', 10, '08:00:00', '17:00:00', 50);

INSERT INTO staff_services (counter_label, staff_id, service_id) VALUES
('Room 1', 1, 1);

INSERT INTO clinic_settings (clinic_name, time_zone, near_threshold, grace_minutes, default_travel_minutes) VALUES
('ClinicFlow Main', 'Asia/Manila', 3, 10, 15);

INSERT INTO tickets (queue_date, queue_number, status, patient_id, staff_id, service_id, queued_at) VALUES
((NOW() AT TIME ZONE 'Asia/Manila')::date, 1, 'completed', 1, 1,    1, NOW() - INTERVAL '2 hours'),
((NOW() AT TIME ZONE 'Asia/Manila')::date, 2, 'completed', 2, 1,    1, NOW() - INTERVAL '1 hour'),
((NOW() AT TIME ZONE 'Asia/Manila')::date, 3, 'waiting',   3, NULL, 1, NOW());

INSERT INTO ticket_history (action, reason, ticket_id, staff_id) VALUES
('completed', 'Finished consultation', 1, 1),
('completed', 'Finished consultation', 2, 1);

INSERT INTO tickets (queue_date, queue_number, status, patient_id, staff_id, service_id, queued_at, called_at, completed_at) VALUES
((NOW() AT TIME ZONE 'Asia/Manila')::date - 21, 1, 'completed', 1, 1, 1, NOW() - INTERVAL '506 hours', NOW() - INTERVAL '505 hours', NOW() - INTERVAL '504 hours'),
((NOW() AT TIME ZONE 'Asia/Manila')::date - 18, 2, 'completed', 2, 2, 1, NOW() - INTERVAL '434 hours', NOW() - INTERVAL '433 hours', NOW() - INTERVAL '432 hours'),
((NOW() AT TIME ZONE 'Asia/Manila')::date - 14, 3, 'completed', 3, 1, 1, NOW() - INTERVAL '338 hours', NOW() - INTERVAL '337 hours', NOW() - INTERVAL '336 hours'),
((NOW() AT TIME ZONE 'Asia/Manila')::date - 10, 4, 'completed', 1, 2, 1, NOW() - INTERVAL '242 hours', NOW() - INTERVAL '241 hours', NOW() - INTERVAL '240 hours'),
((NOW() AT TIME ZONE 'Asia/Manila')::date - 7,  5, 'completed', 2, 1, 1, NOW() - INTERVAL '170 hours', NOW() - INTERVAL '169 hours', NOW() - INTERVAL '168 hours'),
((NOW() AT TIME ZONE 'Asia/Manila')::date - 3,  6, 'completed', 3, 2, 1, NOW() - INTERVAL '74 hours',  NOW() - INTERVAL '73 hours',  NOW() - INTERVAL '72 hours');
