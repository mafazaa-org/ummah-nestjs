const mongoose = require('mongoose');

// Connect to MongoDB
async function cleanupTestPosts() {
  try {
    await mongoose.connect('mongodb://localhost:27017/test', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Define Post schema to match your model
    const postSchema = new mongoose.Schema({
      author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      content: { type: String, required: true, trim: true, maxlength: 5000 },
      images: [{ type: String }],
      likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
      shares: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
      page: { type: mongoose.Schema.Types.ObjectId, ref: 'Page' },
      originalPost: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
      isRepost: { type: Boolean, default: false },
      isDeleted: { type: Boolean, default: false },
    }, { timestamps: true });

    const Post = mongoose.model('Post', postSchema);

    // Find posts with test/hardcoded content
    const testPosts = await Post.find({
      $or: [
        { content: /test|Test|TEST|hardcoded|sample|example/i },
        { content: { $regex: /This is a test post/i } },
        { content: { $regex: /hard.*coded|sample.*content/i } }
      ]
    });

    console.log(`Found ${testPosts.length} test posts:`);
    testPosts.forEach((post, index) => {
      console.log(`${index + 1}. ID: ${post._id}, Content: ${post.content.substring(0, 50)}...`);
    });

    if (testPosts.length > 0) {
      console.log('\nDo you want to delete these test posts? (y/n)');
      // In a real script, you'd use readline for user input
      // For now, let's just log them
    }

    // Also check for posts with very short content that might be test data
    const shortPosts = await Post.find({
      content: { $exists: true, $ne: '', $regex: /^.{1,10}$/ }
    });

    console.log(`\nFound ${shortPosts.length} very short posts (might be test data):`);
    shortPosts.forEach((post, index) => {
      console.log(`${index + 1}. ID: ${post._id}, Content: "${post.content}"`);
    });

    // Check for posts created in the last hour (recent test posts)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentPosts = await Post.find({
      createdAt: { $gte: oneHourAgo }
    }).populate('author', 'username');

    console.log(`\nFound ${recentPosts.length} posts created in the last hour:`);
    recentPosts.forEach((post, index) => {
      console.log(`${index + 1}. ID: ${post._id}, Author: ${post.author?.username || 'Unknown'}, Content: ${post.content.substring(0, 30)}...`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the cleanup
cleanupTestPosts();