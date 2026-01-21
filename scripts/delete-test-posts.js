const mongoose = require('mongoose');

// Connect to MongoDB and delete test posts
async function deleteTestPosts() {
  try {
    await mongoose.connect('mongodb://localhost:27017/test');

    console.log('Connected to MongoDB');

    // Define Post schema
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

    // Delete posts with test content
    const deleteResult = await Post.deleteMany({
      $or: [
        { content: /test|Test|TEST|hardcoded|sample|example/i },
        { content: { $regex: /This is a test post/i } },
        { content: { $regex: /Testing the repost/i } }
      ]
    });

    console.log(`Deleted ${deleteResult.deletedCount} test posts`);

    // Verify deletion
    const remainingTestPosts = await Post.find({
      $or: [
        { content: /test|Test|TEST|hardcoded|sample|example/i },
        { content: { $regex: /This is a test post/i } },
        { content: { $regex: /Testing the repost/i } }
      ]
    });

    console.log(`Remaining test posts: ${remainingTestPosts.length}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the deletion
deleteTestPosts();