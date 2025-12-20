# Quick Setup Guide - MySQL Migration

## Prerequisites

- Node.js 18+
- MySQL 8.0+
- npm or yarn

---

## 🚀 5-Minute Setup

### Step 1: Install MySQL (if not installed)

**Windows:**

```bash
# Download MySQL installer from: https://dev.mysql.com/downloads/installer/
# Install MySQL Server 8.0+
# Set root password during installation
```

**Mac:**

```bash
brew install mysql
brew services start mysql
mysql_secure_installation
```

**Linux:**

```bash
sudo apt update
sudo apt install mysql-server
sudo systemctl start mysql
sudo mysql_secure_installation
```

### Step 2: Create Database

```bash
mysql -u root -p
```

```sql
CREATE DATABASE sureslot_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'sureslot'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON sureslot_db.* TO 'sureslot'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Step 3: Install Dependencies

```bash
cd server
npm install
npm install prisma @prisma/client mysql2
npm install -D prisma
```

### Step 4: Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL="mysql://sureslot:your_password@localhost:3306/sureslot_db"
```

### Step 5: Run Migrations

```bash
npx prisma migrate dev --name init
npx prisma generate
```

You should see:

```
✔ Generated Prisma Client
✔ Applied migration 0_init
✔ Database synchronized
```

### Step 6: Start Server

```bash
npm run dev
```

Expected output:

```
✅ MySQL connected successfully
🚀 Server running on http://localhost:8000
```

### Step 7: Verify Setup

Open Prisma Studio to view database:

```bash
npm run db:studio
```

Browser opens at: `http://localhost:5555`

---

## 🧪 Test Critical Features

### Test 1: Concurrent Booking

```bash
# Install Apache Bench or k6
ab -n 100 -c 10 -p booking.json \
   -T application/json \
   http://localhost:8000/api/v1/bookings

# Expected: 10 successful bookings, 90 rejected (slot full)
# No double-bookings should occur
```

### Test 2: Transaction Rollback

```javascript
// Create booking with invalid data
// Expected: Booking fails, slot count NOT incremented
```

### Test 3: Manual Confirmation

```bash
# 1. Create booking (status: PENDING)
POST /api/v1/bookings

# 2. Confirm booking
POST /api/v1/bookings/:id/confirm

# Expected: Status changes to CONFIRMED, notification sent
```

---

## 🐛 Troubleshooting

### Error: "Can't connect to MySQL server"

**Solution:**

```bash
# Check MySQL is running
sudo systemctl status mysql  # Linux
brew services list           # Mac

# Restart MySQL
sudo systemctl restart mysql # Linux
brew services restart mysql  # Mac
```

### Error: "Access denied for user"

**Solution:**

```bash
# Reset MySQL password
ALTER USER 'root'@'localhost' IDENTIFIED BY 'new_password';
FLUSH PRIVILEGES;

# Update .env with new password
```

### Error: "Prisma Client not found"

**Solution:**

```bash
npx prisma generate
```

### Error: "Migration failed"

**Solution:**

```bash
# Reset database
npx prisma migrate reset --force

# Re-run migrations
npx prisma migrate dev --name init
```

---

## 📊 Verify Migration Success

### Checklist

- [ ] MySQL installed and running
- [ ] Database created
- [ ] Prisma client generated
- [ ] All tables created (10 tables)
- [ ] Foreign keys in place
- [ ] Indexes created
- [ ] Server starts without errors
- [ ] Can create user
- [ ] Can create booking
- [ ] Concurrent booking test passes
- [ ] Transaction rollback works
- [ ] No double-bookings occur

### Query Database

```sql
-- Check tables
SHOW TABLES;

-- Check foreign keys
SELECT
  TABLE_NAME,
  COLUMN_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'sureslot_db'
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- Check indexes
SHOW INDEX FROM bookings;

-- Count records
SELECT
  'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'bookings', COUNT(*) FROM bookings
UNION ALL
SELECT 'slots', COUNT(*) FROM slots;
```

---

## 🎯 Next Steps

1. ✅ Setup complete
2. ⏭️ Migrate User Service → [`src/services/user.service.js`]
3. ⏭️ Update Auth Controller → Point to new service
4. ⏭️ Test authentication flow
5. ⏭️ Continue with remaining services

---

## 📚 Useful Commands

```bash
# Development
npm run dev              # Start server
npm run db:studio        # Open Prisma Studio

# Database
npm run db:migrate       # Run migrations
npm run db:generate      # Generate client
npm run db:reset         # Reset database
npm run db:push          # Push schema (no migration)

# Production
npm run db:migrate:prod  # Deploy migrations
npm start                # Start production server
```

---

## 🆘 Get Help

**Documentation:**

- Prisma: https://www.prisma.io/docs
- MySQL: https://dev.mysql.com/doc/

**Check Logs:**

```bash
# Enable query logging in .env
# Add to DATABASE_URL: ?logQueries=true

# View MySQL error log
tail -f /var/log/mysql/error.log  # Linux
tail -f /usr/local/var/mysql/*.err # Mac
```

**Common Issues:**

- Connection refused → MySQL not running
- Access denied → Wrong credentials
- Migration failed → Check schema syntax
- Prisma Client not found → Run `npx prisma generate`

---

**Setup Time:** ~10 minutes  
**Status:** ✅ Ready for development
