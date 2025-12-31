require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const { generateUniqueHandle } = require('../src/utils/handleGenerator');

/**
 * Migration script to generate handles for existing users
 * This script will:
 * 1. Find all users without a handle
 * 2. Generate a unique handle for each based on their fullName
 * 3. Save the handle to the database
 */

async function migrateHandles() {
  try {
    // Connect to database
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Database connected');

    // Find all users without a handle
    const usersWithoutHandle = await User.find({
      $or: [
        { handle: { $exists: false } },
        { handle: null },
        { handle: '' }
      ]
    });

    console.log(`\n📊 Found ${usersWithoutHandle.length} users without handles`);

    if (usersWithoutHandle.length === 0) {
      console.log('✅ All users already have handles. Migration complete!');
      await mongoose.connection.close();
      return;
    }

    // Process each user
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (let i = 0; i < usersWithoutHandle.length; i++) {
      const user = usersWithoutHandle[i];
      try {
        console.log(`\n[${i + 1}/${usersWithoutHandle.length}] Processing user: ${user.fullName} (ID: ${user._id})`);

        // Generate unique handle
        const handle = await generateUniqueHandle(user.fullName);
        console.log(`   Generated handle: ${handle}`);

        // Update user with handle
        user.handle = handle;
        await user.save();

        console.log(`   ✅ Successfully assigned handle: ${handle}`);
        successCount++;

      } catch (error) {
        console.error(`   ❌ Error processing user ${user._id} (${user.fullName}):`, error.message);
        errorCount++;
        errors.push({
          userId: user._id,
          fullName: user.fullName,
          error: error.message
        });
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total users processed: ${usersWithoutHandle.length}`);
    console.log(`✅ Successfully migrated: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);

    if (errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      errors.forEach(err => {
        console.log(`   - User ${err.userId} (${err.fullName}): ${err.error}`);
      });
    }

    console.log('\n✅ Migration completed!');
    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  migrateHandles();
}

module.exports = { migrateHandles };
