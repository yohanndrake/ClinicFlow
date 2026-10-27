CREATE DATABASE IF NOT EXISTS clinicflow
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE clinicflow;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS ticket_history;
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS staff_services;
DROP TABLE IF EXISTS services;
DROP TABLE IF EXISTS admins;
DROP TABLE IF EXISTS staff;
DROP TABLE IF EXISTS patients;
DROP TABLE IF EXISTS clinic_settings;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE patients (
    patient_id           INT UNSIGNED NOT NULL AUTO_INCREMENT
  , full_name            VARCHAR(100) NOT NULL
  , email                VARCHAR(100) NOT NULL
  , password_hash        VARCHAR(255) NOT NULL
  , contact_number       VARCHAR(20)  NULL
  , status               ENUM('active', 'inactive') NOT NULL DEFAULT 'active'
  , must_change_password TINYINT(1)   NOT NULL DEFAULT 0
  , created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
  , PRIMARY KEY          (patient_id)
  , UNIQUE KEY           uq_patients_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE staff (
    staff_id             INT UNSIGNED NOT NULL AUTO_INCREMENT
  , full_name            VARCHAR(100) NOT NULL
  , email                VARCHAR(100) NOT NULL
  , password_hash        VARCHAR(255) NOT NULL
  , contact_number       VARCHAR(20)  NULL
  , status               ENUM('active', 'inactive') NOT NULL DEFAULT 'active'
  , must_change_password TINYINT(1)   NOT NULL DEFAULT 0
  , created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
  , PRIMARY KEY          (staff_id)
  , UNIQUE KEY           uq_staff_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admins (
    admin_id             INT UNSIGNED NOT NULL AUTO_INCREMENT
  , full_name            VARCHAR(100) NOT NULL
  , email                VARCHAR(100) NOT NULL
  , password_hash        VARCHAR(255) NOT NULL
  , contact_number       VARCHAR(20)  NULL
  , status               ENUM('active', 'inactive') NOT NULL DEFAULT 'active'
  , must_change_password TINYINT(1)   NOT NULL DEFAULT 0
  , created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
  , PRIMARY KEY          (admin_id)
  , UNIQUE KEY           uq_admins_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE clinic_settings (
    setting_id             INT UNSIGNED NOT NULL AUTO_INCREMENT
  , clinic_name            VARCHAR(100) NOT NULL
  , time_zone              VARCHAR(50)  NOT NULL
  , near_threshold         INT UNSIGNED NOT NULL DEFAULT 3
  , grace_minutes          INT UNSIGNED NOT NULL DEFAULT 10
  , default_travel_minutes INT UNSIGNED NOT NULL DEFAULT 15
  , PRIMARY KEY            (setting_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE services (
    service_id          INT UNSIGNED NOT NULL AUTO_INCREMENT
  , service_name        VARCHAR(100) NOT NULL
  , prefix              VARCHAR(3)   NOT NULL
  , description         VARCHAR(255) NULL
  , avg_service_minutes INT UNSIGNED NOT NULL DEFAULT 10
  , open_time           TIME         NOT NULL
  , close_time          TIME         NOT NULL
  , daily_limit         INT UNSIGNED NULL
  , queue_status        ENUM('open', 'paused', 'closed') NOT NULL DEFAULT 'open'
  , status_note         VARCHAR(100) NULL
  , is_active           TINYINT(1)   NOT NULL DEFAULT 1
  , created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
  , PRIMARY KEY         (service_id)
  , UNIQUE KEY          uq_services_name (service_name)
  , UNIQUE KEY          uq_services_prefix (prefix)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE staff_services (
    staff_service_id INT UNSIGNED NOT NULL AUTO_INCREMENT
  , counter_label    VARCHAR(30)  NOT NULL
  , staff_id         INT UNSIGNED NOT NULL
  , service_id       INT UNSIGNED NOT NULL
  , PRIMARY KEY      (staff_service_id)
  , UNIQUE KEY       uq_staff_services_unique (staff_id, service_id)
  , CONSTRAINT       fk_staff_services_staff FOREIGN KEY (staff_id) REFERENCES staff (staff_id) ON DELETE CASCADE
  , CONSTRAINT       fk_staff_services_service FOREIGN KEY (service_id) REFERENCES services (service_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tickets (
    ticket_id      INT UNSIGNED NOT NULL AUTO_INCREMENT
  , queue_date     DATE         NOT NULL
  , queue_number   INT UNSIGNED NOT NULL
  , walk_in_name   VARCHAR(100) NULL
  , status         ENUM('waiting', 'serving', 'completed', 'skipped', 'cancelled') NOT NULL DEFAULT 'waiting'
  , priority       TINYINT(1)   NOT NULL DEFAULT 0
  , note           VARCHAR(100) NULL
  , travel_minutes INT UNSIGNED NULL
  , status_reason  VARCHAR(100) NULL
  , queued_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
  , called_at      DATETIME     NULL
  , arrived_at     DATETIME     NULL
  , completed_at   DATETIME     NULL
  , is_deleted     TINYINT(1)   NOT NULL DEFAULT 0
  , patient_id     INT UNSIGNED NULL
  , staff_id       INT UNSIGNED NULL
  , service_id     INT UNSIGNED NOT NULL
  , PRIMARY KEY    (ticket_id)
  , UNIQUE KEY     uq_tickets_queue (service_id, queue_date, queue_number)
  , KEY            idx_tickets_date (queue_date)
  , CONSTRAINT     fk_tickets_patient FOREIGN KEY (patient_id) REFERENCES patients (patient_id) ON DELETE SET NULL
  , CONSTRAINT     fk_tickets_staff FOREIGN KEY (staff_id) REFERENCES staff (staff_id) ON DELETE SET NULL
  , CONSTRAINT     fk_tickets_service FOREIGN KEY (service_id) REFERENCES services (service_id) ON DELETE RESTRICT
  , CONSTRAINT     chk_tickets_identity CHECK (patient_id IS NOT NULL OR walk_in_name IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ticket_history (
    history_id  INT UNSIGNED NOT NULL AUTO_INCREMENT
  , action      ENUM('created', 'called', 'completed', 'skipped', 'cancelled', 'edited', 'deleted', 'restored', 'expired') NOT NULL
  , reason      VARCHAR(100) NULL
  , changed_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
  , ticket_id   INT UNSIGNED NOT NULL
  , patient_id  INT UNSIGNED NULL
  , staff_id    INT UNSIGNED NULL
  , admin_id    INT UNSIGNED NULL
  , PRIMARY KEY (history_id)
  , KEY         idx_ticket_history_ticket (ticket_id)
  , CONSTRAINT  fk_ticket_history_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (ticket_id) ON DELETE CASCADE
  , CONSTRAINT  fk_ticket_history_patient FOREIGN KEY (patient_id) REFERENCES patients (patient_id) ON DELETE SET NULL
  , CONSTRAINT  fk_ticket_history_staff FOREIGN KEY (staff_id) REFERENCES staff (staff_id) ON DELETE SET NULL
  , CONSTRAINT  fk_ticket_history_admin FOREIGN KEY (admin_id) REFERENCES admins (admin_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
    notification_id INT UNSIGNED NOT NULL AUTO_INCREMENT
  , type            ENUM('near', 'called', 'skipped', 'cancelled', 'paused') NOT NULL
  , message         VARCHAR(150) NOT NULL
  , is_read         TINYINT(1)   NOT NULL DEFAULT 0
  , created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
  , patient_id      INT UNSIGNED NOT NULL
  , ticket_id       INT UNSIGNED NULL
  , PRIMARY KEY     (notification_id)
  , KEY             idx_notifications_patient (patient_id, is_read)
  , CONSTRAINT      fk_notifications_patient FOREIGN KEY (patient_id) REFERENCES patients (patient_id) ON DELETE CASCADE
  , CONSTRAINT      fk_notifications_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (ticket_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;