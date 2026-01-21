const mongoose = require('mongoose');

async function clearDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/test');

    console.log('Connected to MongoDB');

    // Force drop all collections and indexes
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    console.log(`Found ${collections.length} collections`);

    for (const collection of collections) {
      console.log(`Processing collection: ${collection.name}`);

      try {
        // Drop all indexes first
        await db.collection(collection.name).dropIndexes();
        console.log(`Dropped indexes for ${collection.name}`);
      } catch (e) {
        console.log(`Could not drop indexes for ${collection.name}:`, e.message);
      }

      try {
        // Drop the collection
        await db.dropCollection(collection.name);
        console.log(`Dropped collection: ${collection.name}`);
      } catch (e) {
        console.log(`Could not drop collection ${collection.name}:`, e.message);
      }
    }

    // Also try to drop the database completely
    try {
      await db.dropDatabase();
      console.log('Database dropped successfully');
    } catch (e) {
      console.log('Could not drop database:', e.message);
    }

    // Close connection
    await mongoose.connection.close();

    console.log('Connection closed');
  } catch (error) {
    console.error('Error clearing database:', error);
    process.exit(1);
  }
}

clearDatabase();