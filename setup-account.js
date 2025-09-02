const express = require("express");
const app = express();
require("dotenv").config();
const connectDB = require("./db/config");

// Initialize Express and database
app.use(express.json());

// Setup account and chat sync
async function setupAccountAndSync() {
    try {
        console.log('🚀 Setting up account and initial sync...');
        
        // Connect to database
        await connectDB();
        console.log('✅ Database connected');
        
        // Import controllers after DB connection
        const Account = require('./db/Account');
        const ChatController = require('./controllers/chatController');
        
        // Create or find the naveendev account
        let account = await Account.findOne({ email: 'naveendev@crossmilescarrier.com' });
        
        if (!account) {
            console.log('📝 Creating naveendev account...');
            account = new Account({
                email: 'naveendev@crossmilescarrier.com',
                name: 'Naveen Dev',
                createdAt: new Date()
            });
            await account.save();
            console.log('✅ Account created:', account._id);
        } else {
            console.log('✅ Account exists:', account._id);
        }
        
        // Mock request/response for sync
        const mockReq = {
            params: { accountEmail: 'naveendev@crossmilescarrier.com' }
        };
        
        const mockRes = {
            json: (data) => {
                console.log('📊 Sync Result:', data);
                return mockRes;
            },
            status: (code) => {
                console.log('📊 Status:', code);
                return mockRes;
            }
        };
        
        console.log('🔄 Starting chat sync...');
        await ChatController.syncChats(mockReq, mockRes);
        
    } catch (error) {
        console.error('❌ Setup failed:', error);
    } finally {
        process.exit(0);
    }
}

setupAccountAndSync();
