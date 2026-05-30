-- ============================================================
--  SafePay DBMS Project — SQL Queries
-- ============================================================
USE safepay;

-- ------------------------------------------------------------
-- QUERY 1: Get student profile + balance + limits
-- ------------------------------------------------------------
SELECT
    u.user_id,
    u.full_name,
    u.phone,
    u.upi_id,
    u.college,
    w.balance,
    sl.monthly_limit,
    sl.daily_limit,
    sl.per_txn_limit
FROM users u
JOIN wallets w         ON w.user_id      = u.user_id
JOIN spending_limits sl ON sl.student_id = u.user_id
WHERE u.user_id = 1 AND u.role = 'student';

-- ------------------------------------------------------------
-- QUERY 2: Get all transactions for a student (with location)
-- ------------------------------------------------------------
SELECT
    t.txn_id,
    t.merchant_name,
    t.merchant_upi,
    t.amount,
    t.note,
    t.status,
    t.scanned_qr,
    t.created_at,
    g.address   AS location,
    g.latitude,
    g.longitude
FROM transactions t
LEFT JOIN gps_locations g ON g.location_id = t.location_id
WHERE t.student_id = 1
ORDER BY t.created_at DESC;

-- ------------------------------------------------------------
-- QUERY 3: Monthly spent so far (for limit check)
-- ------------------------------------------------------------
SELECT
    SUM(amount) AS total_spent_this_month
FROM transactions
WHERE student_id = 1
  AND status = 'success'
  AND MONTH(created_at) = MONTH(CURDATE())
  AND YEAR(created_at)  = YEAR(CURDATE());

-- ------------------------------------------------------------
-- QUERY 4: Check daily limit before allowing a transaction
-- ------------------------------------------------------------
SELECT
    COALESCE(SUM(t.amount), 0)    AS spent_today,
    sl.daily_limit,
    (sl.daily_limit - COALESCE(SUM(t.amount), 0)) AS remaining_today
FROM spending_limits sl
LEFT JOIN transactions t
    ON  t.student_id = sl.student_id
    AND DATE(t.created_at) = CURDATE()
    AND t.status = 'success'
WHERE sl.student_id = 1
GROUP BY sl.daily_limit;

-- ------------------------------------------------------------
-- QUERY 5: Parent dashboard — all alerts with GPS
-- ------------------------------------------------------------
SELECT
    pn.notif_id,
    pn.message,
    pn.is_read,
    pn.sent_at,
    t.amount,
    t.merchant_name,
    t.note,
    g.address,
    g.latitude,
    g.longitude
FROM parent_notifications pn
JOIN transactions   t ON t.txn_id      = pn.txn_id
LEFT JOIN gps_locations g ON g.location_id = t.location_id
WHERE pn.parent_id = 2
ORDER BY pn.sent_at DESC;

-- ------------------------------------------------------------
-- QUERY 6: Student's spending by category this month
-- ------------------------------------------------------------
SELECT
    m.category,
    COUNT(t.txn_id)  AS num_transactions,
    SUM(t.amount)    AS total_spent
FROM transactions t
JOIN merchants m ON m.upi_id = t.merchant_upi
WHERE t.student_id = 1
  AND t.status = 'success'
  AND MONTH(t.created_at) = MONTH(CURDATE())
GROUP BY m.category
ORDER BY total_spent DESC;

-- ------------------------------------------------------------
-- QUERY 7: Insert a new transaction + GPS + notification
-- (Run these 3 in a transaction block)
-- ------------------------------------------------------------
START TRANSACTION;

-- Step 1: Log GPS location
INSERT INTO gps_locations (user_id, latitude, longitude, address)
VALUES (1, 17.3850, 78.4867, 'CBIT College, Hyderabad');

-- Step 2: Insert transaction
INSERT INTO transactions (student_id, merchant_upi, merchant_name, amount, note, status, location_id, scanned_qr)
VALUES (1, 'canteen@upi', 'College Canteen', 85.00, 'Evening snacks', 'success', LAST_INSERT_ID(), TRUE);

-- Step 3: Deduct from wallet
UPDATE wallets
SET balance = balance - 85.00
WHERE user_id = 1;

-- Step 4: Notify parent
INSERT INTO parent_notifications (parent_id, txn_id, message)
VALUES (
    2,
    LAST_INSERT_ID(),
    CONCAT('Arjun paid ₹85 to College Canteen (Evening snacks) at CBIT College, Hyderabad')
);

COMMIT;

-- ------------------------------------------------------------
-- QUERY 8: Parent updates spending limits
-- ------------------------------------------------------------
UPDATE spending_limits
SET monthly_limit = 6000.00,
    daily_limit   = 1200.00,
    per_txn_limit = 600.00
WHERE student_id = 1 AND set_by_parent_id = 2;

-- ------------------------------------------------------------
-- QUERY 9: Approve a limit increase request
-- ------------------------------------------------------------
UPDATE limit_increase_requests
SET status = 'approved', responded_at = NOW()
WHERE request_id = 1 AND parent_id = 2;

-- Also increase the limit
UPDATE spending_limits
SET monthly_limit = monthly_limit + (
    SELECT requested_amt FROM limit_increase_requests WHERE request_id = 1
)
WHERE student_id = 1;

-- ------------------------------------------------------------
-- QUERY 10: Mark all parent notifications as read
-- ------------------------------------------------------------
UPDATE parent_notifications
SET is_read = TRUE
WHERE parent_id = 2 AND is_read = FALSE;

-- ------------------------------------------------------------
-- QUERY 11: Get unread notification count for parent
-- ------------------------------------------------------------
SELECT COUNT(*) AS unread_count
FROM parent_notifications
WHERE parent_id = 2 AND is_read = FALSE;

-- ------------------------------------------------------------
-- QUERY 12: Student location history (last 10 locations)
-- ------------------------------------------------------------
SELECT
    g.address,
    g.latitude,
    g.longitude,
    g.captured_at,
    t.amount,
    t.merchant_name
FROM gps_locations g
JOIN transactions t ON t.location_id = g.location_id
WHERE g.user_id = 1
ORDER BY g.captured_at DESC
LIMIT 10;
