// MongoDB Data Copy Script
// This script copies all collections from whatsappBot database to speak-shine database
// Run this in mongosh while connected to your Atlas cluster

// Connect to source database
const sourceDb = db.getSiblingDB('whatsappBot');
const targetDb = db.getSiblingDB('speak-shine');

print('=================================');
print('MongoDB Data Copy Script');
print('=================================');
print('Source: whatsappBot');
print('Target: speak-shine');
print('=================================\n');

// List of collections to copy
const collections = [
  'attendances',
  'auths',
  'dailyreports',
  'grammarsettings',
  'livesessions',
  'notifications',
  'pendingregistrations',
  'questions',
  'status',
  'streakrecords',
  'uploadaudits',
  'users',
  'videoreports'
];

let totalCopied = 0;
let errors = [];

// Copy each collection
collections.forEach(collectionName => {
  try {
    print(`\n📦 Processing collection: ${collectionName}`);
    
    // Check if collection exists in source
    const sourceCollections = sourceDb.getCollectionNames();
    if (!sourceCollections.includes(collectionName)) {
      print(`  ⚠️  Collection '${collectionName}' not found in source database - skipping`);
      return;
    }
    
    // Get document count
    const count = sourceDb[collectionName].countDocuments();
    print(`  📊 Documents in source: ${count}`);
    
    if (count === 0) {
      print(`  ⏭️  Empty collection - skipping`);
      return;
    }
    
    // Drop target collection if it exists (clean slate)
    try {
      targetDb[collectionName].drop();
      print(`  🗑️  Dropped existing target collection`);
    } catch (e) {
      // Collection might not exist, that's fine
    }
    
    // Copy all documents
    const documents = sourceDb[collectionName].find().toArray();
    if (documents.length > 0) {
      const result = targetDb[collectionName].insertMany(documents, { ordered: false });
      print(`  ✅ Copied ${result.insertedIds ? Object.keys(result.insertedIds).length : documents.length} documents`);
      totalCopied += documents.length;
    }
    
    // Copy indexes
    const indexes = sourceDb[collectionName].getIndexes();
    indexes.forEach(index => {
      // Skip the default _id index
      if (index.name === '_id_') return;
      
      try {
        const keys = index.key;
        const options = {
          name: index.name,
          unique: index.unique || false,
          sparse: index.sparse || false
        };
        
        targetDb[collectionName].createIndex(keys, options);
        print(`  🔑 Copied index: ${index.name}`);
      } catch (e) {
        print(`  ⚠️  Could not copy index '${index.name}': ${e.message}`);
      }
    });
    
  } catch (error) {
    const errorMsg = `Error copying ${collectionName}: ${error.message}`;
    print(`  ❌ ${errorMsg}`);
    errors.push(errorMsg);
  }
});

// Summary
print('\n=================================');
print('Copy Summary');
print('=================================');
print(`Total documents copied: ${totalCopied}`);
if (errors.length > 0) {
  print(`\n❌ Errors encountered: ${errors.length}`);
  errors.forEach(err => print(`  - ${err}`));
} else {
  print('✅ All collections copied successfully!');
}
print('=================================\n');

// Verification
print('Verification:');
print('=================================');
collections.forEach(collectionName => {
  const sourceCount = sourceDb[collectionName].countDocuments();
  const targetCount = targetDb[collectionName].countDocuments();
  const status = sourceCount === targetCount ? '✅' : '❌';
  print(`${status} ${collectionName}: source=${sourceCount}, target=${targetCount}`);
});
print('=================================\n');
