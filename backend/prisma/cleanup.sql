-- ============================================
-- QPark DB Cleanup
-- Removes unused tables and columns
-- ============================================

-- Drop tables not managed by Prisma
DROP TABLE IF EXISTS otp_codes CASCADE;
DROP TABLE IF EXISTS system_configs CASCADE;
DROP TABLE IF EXISTS admins CASCADE;

-- Remove carPlate from users (replaced by cars table)
ALTER TABLE users DROP COLUMN IF EXISTS "carPlate";

-- Add bonusPoints if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS "bonusPoints" integer NOT NULL DEFAULT 0;

-- Create cars table if not exists
CREATE TABLE IF NOT EXISTS cars (
  id TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  "plateNumber" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cars_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Verify result
SELECT
  table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
