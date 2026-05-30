-- ============================================================
--  SafePay DBMS Project — MySQL Schema
--  Student UPI App with Parental Monitoring
-- ============================================================

CREATE DATABASE IF NOT EXISTS safepay;
USE safepay;

-- ------------------------------------------------------------
-- 1. FAMILIES  (links a student to their parent)
-- ------------------------------------------------------------
CREATE TABLE families (
    family_id     INT AUTO_INCREMENT PRIMARY KEY,
    family_name   VARCHAR(100) NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- 2. USERS  (both students and parents)
-- ------------------------------------------------------------
CREATE TABLE users (
    user_id       INT AUTO_INCREMENT PRIMARY KEY,
    family_id     INT NOT NULL,
    full_name     VARCHAR(100) NOT NULL,
    phone         VARCHAR(15) NOT NULL UNIQUE,
    email         VARCHAR(100) UNIQUE,
    role          ENUM('student', 'parent') NOT NULL,
    upi_id        VARCHAR(100) UNIQUE,          -- only for students
    pin_hash      VARCHAR(255) NOT NULL,         -- hashed PIN
    college       VARCHAR(150),                  -- only for students
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id) REFERENCES families(family_id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 3. WALLETS  (one wallet per student)
-- ------------------------------------------------------------
CREATE TABLE wallets (
    wallet_id     INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NOT NULL UNIQUE,
    balance       DECIMAL(10,2) DEFAULT 0.00,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 4. SPENDING_LIMITS  (parent sets limits for student)
-- ------------------------------------------------------------
CREATE TABLE spending_limits (
    limit_id          INT AUTO_INCREMENT PRIMARY KEY,
    student_id        INT NOT NULL UNIQUE,
    monthly_limit     DECIMAL(10,2) DEFAULT 5000.00,
    daily_limit       DECIMAL(10,2) DEFAULT 1000.00,
    per_txn_limit     DECIMAL(10,2) DEFAULT 500.00,
    set_by_parent_id  INT NOT NULL,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id)       REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (set_by_parent_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 5. MERCHANTS  (shops / people the student pays)
-- ------------------------------------------------------------
CREATE TABLE merchants (
    merchant_id   INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    upi_id        VARCHAR(100) NOT NULL UNIQUE,
    category      ENUM('food','transport','stationery','hostel','other') DEFAULT 'other',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- 6. GPS_LOCATIONS  (logged at every transaction)
-- ------------------------------------------------------------
CREATE TABLE gps_locations (
    location_id   INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NOT NULL,
    latitude      DECIMAL(10,8) NOT NULL,
    longitude     DECIMAL(11,8) NOT NULL,
    address       VARCHAR(255),
    captured_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 7. TRANSACTIONS  (every payment made by a student)
-- ------------------------------------------------------------
CREATE TABLE transactions (
    txn_id        INT AUTO_INCREMENT PRIMARY KEY,
    student_id    INT NOT NULL,
    merchant_upi  VARCHAR(100) NOT NULL,
    merchant_name VARCHAR(100),
    amount        DECIMAL(10,2) NOT NULL,
    note          VARCHAR(255),
    status        ENUM('success','failed','pending') DEFAULT 'pending',
    location_id   INT,                           -- GPS at time of payment
    scanned_qr    BOOLEAN DEFAULT FALSE,          -- was QR used?
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id)  REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES gps_locations(location_id)
);

-- ------------------------------------------------------------
-- 8. PARENT_NOTIFICATIONS  (alerts sent to parent)
-- ------------------------------------------------------------
CREATE TABLE parent_notifications (
    notif_id      INT AUTO_INCREMENT PRIMARY KEY,
    parent_id     INT NOT NULL,
    txn_id        INT NOT NULL,
    message       TEXT NOT NULL,
    is_read       BOOLEAN DEFAULT FALSE,
    sent_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (txn_id)    REFERENCES transactions(txn_id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 9. LIMIT_INCREASE_REQUESTS  (student requests more budget)
-- ------------------------------------------------------------
CREATE TABLE limit_increase_requests (
    request_id    INT AUTO_INCREMENT PRIMARY KEY,
    student_id    INT NOT NULL,
    parent_id     INT NOT NULL,
    reason        VARCHAR(255) NOT NULL,
    requested_amt DECIMAL(10,2) NOT NULL,
    status        ENUM('pending','approved','denied') DEFAULT 'pending',
    responded_at  TIMESTAMP NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id)  REFERENCES users(user_id) ON DELETE CASCADE
);

-- ============================================================
--  SAMPLE DATA
-- ============================================================

INSERT INTO families (family_name) VALUES ('Kumar Family');

INSERT INTO users (family_id, full_name, phone, email, role, upi_id, pin_hash, college) VALUES
(1, 'Arjun Kumar',  '9876543210', 'arjun@email.com',  'student', 'arjun.kumar@safepay',  SHA2('1234', 256), 'CBIT, Hyderabad'),
(1, 'Meena Kumar',  '9876500001', 'meena@email.com',  'parent',  NULL,                   SHA2('5678', 256), NULL);

INSERT INTO wallets (user_id, balance) VALUES (1, 3200.00);

INSERT INTO spending_limits (student_id, monthly_limit, daily_limit, per_txn_limit, set_by_parent_id)
VALUES (1, 5000.00, 1000.00, 500.00, 2);

INSERT INTO merchants (name, upi_id, category) VALUES
('College Canteen',   'canteen@upi',     'food'),
('Auto Driver',       'auto@upi',        'transport'),
('Campus Books',      'stationery@upi',  'stationery'),
('Hostel Office',     'hostel@upi',      'hostel');

INSERT INTO gps_locations (user_id, latitude, longitude, address) VALUES
(1, 17.3850, 78.4867, 'CBIT College, Hyderabad'),
(1, 17.3732, 78.5527, 'Kothapet, Hyderabad'),
(1, 17.3616, 78.5288, 'Dilsukhnagar, Hyderabad');

INSERT INTO transactions (student_id, merchant_upi, merchant_name, amount, note, status, location_id, scanned_qr) VALUES
(1, 'canteen@upi',    'College Canteen', 180.00, 'Lunch',     'success', 1, FALSE),
(1, 'auto@upi',       'Auto Driver',      80.00, 'Auto fare', 'success', 2, FALSE),
(1, 'stationery@upi', 'Campus Books',    320.00, 'Notebooks', 'success', 3, TRUE);

INSERT INTO parent_notifications (parent_id, txn_id, message) VALUES
(2, 1, 'Arjun paid ₹180 to College Canteen (Lunch) at CBIT College, Hyderabad'),
(2, 2, 'Arjun paid ₹80 to Auto Driver (Auto fare) at Kothapet, Hyderabad'),
(2, 3, 'Arjun paid ₹320 to Campus Books (Notebooks) at Dilsukhnagar, Hyderabad');
