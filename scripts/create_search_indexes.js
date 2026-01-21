/**
 * Migration Script: Create Search Indexes for Unified Triple-Field Search
 * 
 * This script creates indexes on the User collection to optimize search performance
 * for the unified search that queries fullName, handle, and username simultaneously.
 * 
 * Usage:
 *   node scripts/create_search_indexes.js
 * 
 * Environment variables required:
 *   MONGODB_URI - MongoDB connection string
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI environment variable is not set');
  process.exit(1);
}

async function createSearchIndexes() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully!\n');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    console.log('Creating indexes for Unified Triple-Field Search...\n');

    // Index 1: fullName for display name search
    console.log('1. Creating index on fullName...');
    try {
      await usersCollection.createIndex(
        { fullName: 1 },
        { name: 'fullName_search_idx', background: true }
      );
      console.log('   ✓ fullName index created successfully');
    } catch (err) {
      if (err.code === 85) {
        console.log('   ℹ fullName index already exists');
      } else {
        throw err;
      }
    }

    // Index 2: handle for @handle search
    console.log('2. Creating index on handle...');
    try {
      await usersCollection.createIndex(
        { handle: 1 },
        { name: 'handle_search_idx', background: true, sparse: true }
      );
      console.log('   ✓ handle index created successfully');
    } catch (err) {
      if (err.code === 85) {
        console.log('   ℹ handle index already exists');
      } else {
        throw err;
      }
    }

    // Index 3: username for email/phone search (likely already exists as unique)
    console.log('3. Verifying index on username...');
    const existingIndexes = await usersCollection.indexes();
    const hasUsernameIndex = existingIndexes.some(idx => 
      idx.key && idx.key.username !== undefined
    );
    if (hasUsernameIndex) {
      console.log('   ✓ username index already exists (unique constraint)');
    } else {
      await usersCollection.createIndex(
        { username: 1 },
        { name: 'username_search_idx', background: true }
      );
      console.log('   ✓ username index created successfully');
    }

    // Optional: Create a compound text index for more advanced full-text search
    // Uncomment if you want to enable MongoDB text search capabilities
    /*
    console.log('4. Creating text index for full-text search...');
    try {
      await usersCollection.createIndex(
        { fullName: 'text', handle: 'text', username: 'text' },
        { name: 'user_text_search_idx', background: true }
      );
      console.log('   ✓ Text index created successfully');
    } catch (err) {
      if (err.code === 85) {
        console.log('   ℹ Text index already exists');
      } else {
        throw err;
      }
    }
    */

    console.log('\n========================================');
    console.log('Index creation completed successfully!');
    console.log('========================================\n');

    // Display current indexes
    console.log('Current indexes on users collection:');
    const indexes = await usersCollection.indexes();
    indexes.forEach((idx, i) => {
      console.log(`  ${i + 1}. ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    console.log('\n✓ Unified Triple-Field Search is now optimized!');

  } catch (error) {
    console.error('\n✗ Error creating indexes:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
  }
}

createSearchIndexes();
