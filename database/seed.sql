USE clinicflow;

-- Insert 1 Admin
INSERT INTO admins (full_name, email, password_hash, contact_number) VALUES 
('System Admin', 'admin@clinicflow.com', 'hashed_pw_admin', '1234567890');

-- Insert 2 Staff
INSERT INTO staff (full_name, email, password_hash, contact_number) VALUES 
('Dr. Staff One', 'staff1@clinicflow.com', 'hashed_pw_staff1', '1112223333'),
('Dr. Staff Two', 'staff2@clinicflow.com', 'hashed_pw_staff2', '4445556666');

-- Insert 3 Patients
INSERT INTO patients (full_name, email, password_hash, contact_number) VALUES 
('John Doe', 'john@example.com', 'hashed_pw_pat1', '5550001111'),
('Jane Smith', 'jane@example.com', 'hashed_pw_pat2', '5550002222'),
('Bob Wilson', 'bob@example.com', 'hashed_pw_pat3', '5550003333');

-- Insert 1 Service
INSERT INTO services (service_name, prefix, description, avg_service_minutes, open_time, close_time, daily_limit) VALUES 
('General Consultation', 'G', 'Standard checkup', 10, '08:00:00', '17:00:00', 50);

-- Assign Staff to Service (Staff 1 at Room 1)
INSERT INTO staff_services (counter_label, staff_id, service_id) VALUES 
('Room 1', 1, 1);

-- Insert Clinic Settings
INSERT INTO clinic_settings (clinic_name, time_zone, near_threshold, grace_minutes, default_travel_minutes) VALUES 
('ClinicFlow Main', 'Asia/Manila', 3, 10, 15);

-- Insert Tickets
INSERT INTO tickets (queue_date, queue_number, status, patient_id, staff_id, service_id, queued_at) VALUES 
(CURDATE(), 1, 'completed', 1, 1, 1, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(CURDATE(), 2, 'completed', 2, 1, 1, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
(CURDATE(), 3, 'waiting', 3, NULL, 1, NOW());

-- Insert Sample Ticket History
INSERT INTO ticket_history (action, reason, ticket_id, staff_id) VALUES
('completed', 'Finished consultation', 1, 1),
('completed', 'Finished consultation', 2, 1);

-- Insert 3 weeks of historical fake tickets for demo charts
INSERT INTO tickets (queue_date, queue_number, status, patient_id, staff_id, service_id, queued_at, called_at, completed_at) VALUES 
(CURDATE() - INTERVAL 21 DAY, 1, 'completed', 1, 1, 1, DATE_SUB(NOW(), INTERVAL 506 HOUR), DATE_SUB(NOW(), INTERVAL 505 HOUR), DATE_SUB(NOW(), INTERVAL 504 HOUR)),
(CURDATE() - INTERVAL 18 DAY, 2, 'completed', 2, 2, 1, DATE_SUB(NOW(), INTERVAL 434 HOUR), DATE_SUB(NOW(), INTERVAL 433 HOUR), DATE_SUB(NOW(), INTERVAL 432 HOUR)),
(CURDATE() - INTERVAL 14 DAY, 3, 'completed', 3, 1, 1, DATE_SUB(NOW(), INTERVAL 338 HOUR), DATE_SUB(NOW(), INTERVAL 337 HOUR), DATE_SUB(NOW(), INTERVAL 336 HOUR)),
(CURDATE() - INTERVAL 10 DAY, 4, 'completed', 1, 2, 1, DATE_SUB(NOW(), INTERVAL 242 HOUR), DATE_SUB(NOW(), INTERVAL 241 HOUR), DATE_SUB(NOW(), INTERVAL 240 HOUR)),
(CURDATE() - INTERVAL 7 DAY, 5, 'completed', 2, 1, 1, DATE_SUB(NOW(), INTERVAL 170 HOUR), DATE_SUB(NOW(), INTERVAL 169 HOUR), DATE_SUB(NOW(), INTERVAL 168 HOUR)),
(CURDATE() - INTERVAL 3 DAY, 6, 'completed', 3, 2, 1, DATE_SUB(NOW(), INTERVAL 74 HOUR), DATE_SUB(NOW(), INTERVAL 73 HOUR), DATE_SUB(NOW(), INTERVAL 72 HOUR));