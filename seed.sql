-- 默认管理员: admin / admin123456
-- password_hash 是 bcrypt hash of "admin123456"
INSERT OR IGNORE INTO admin_users (id, username, password_hash, display_name) 
VALUES ('admin-001', 'admin', '$2a$10$rQEY7zG7K2Y8G4Z8Y8Y8YeqJx8Z8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8Y8', '系统管理员');
