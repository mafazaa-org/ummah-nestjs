const mongoose = require('mongoose');
require('dotenv').config();

async function dropEmailIndex() {
  try {
    // Connect to MongoDB using the same URI as the app
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/social_media';
    await mongoose.connect(mongoUri);

    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Get all indexes
    const indexes = await usersCollection.indexes();
    console.log('Current indexes:', indexes.map(idx => idx.name));

    // Drop email_1 index if it exists
    try {
      await usersCollection.dropIndex('email_1');
      console.log('✅ Successfully dropped email_1 index');
    } catch (error) {
      if (error.code === 27 || error.message.includes('index not found')) {
        console.log('ℹ️  email_1 index does not exist (already removed)');
      } else {
        throw error;
      }
    }

    // List remaining indexes
    const remainingIndexes = await usersCollection.indexes();
    console.log('Remaining indexes:', remainingIndexes.map(idx => idx.name));

    await mongoose.connection.close();
    console.log('Connection closed');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

dropEmailIndex();
