require('dotenv').config();
const mongoose = require('mongoose');
const ChatController = require('./controllers/chatController');
const connectDB = require('./db/config');

// Use the same connection as the running application

async function syncWorkspaceUsers() {
  try {
    await connectDB();
    console.log('🔄 Starting workspace user sync...');
    
    // Mock request and response objects
    const req = {};
    const res = {
      json: (data) => {
        console.log('✅ Sync completed successfully:');
        console.log(JSON.stringify(data, null, 2));
        process.exit(0);
      },
      status: (code) => ({
        json: (data) => {
          console.error(`❌ Sync failed with status ${code}:`, data);
          process.exit(1);
        }
      })
    };
    
    await ChatController.syncWorkspaceUsers(req, res);
    
  } catch (error) {
    console.error('❌ Error syncing workspace users:', error);
    process.exit(1);
  }
}

syncWorkspaceUsers();
