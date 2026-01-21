const { MongoClient } = require('mongodb');

async function dropAllIndexes() {
  const uri = 'mongodb://localhost:27017';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('test');
    const collections = await db.listCollections().toArray();

    for (const collection of collections) {
      const collectionName = collection.name;
      console.log(`Processing collection: ${collectionName}`);

      try {
        // Drop all indexes except _id_
        const indexes = await db.collection(collectionName).indexes();
        for (const index of indexes) {
          if (index.name !== '_id_') {
            console.log(`Dropping index: ${index.name} from ${collectionName}`);
            await db.collection(collectionName).dropIndex(index.name);
          }
        }
        console.log(`All indexes dropped from ${collectionName}`);
      } catch (e) {
        console.log(`Error processing ${collectionName}:`, e.message);
      }
    }

    console.log('All indexes dropped successfully');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    console.log('Connection closed');
  }
}

dropAllIndexes();