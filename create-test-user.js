require('dotenv').config();
const User = require('./db/Users.js');
const connectDB = require('./db/config.js');

async function createTestUser() {
    try {
        await connectDB();
        
        // Check if user already exists
        const existingUser = await User.findOne({ email: 'admin@test.com' });
        if (existingUser) {
            console.log('✅ Test user already exists:');
            console.log('Email: admin@test.com');
            console.log('Password: admin123');
            process.exit(0);
        }
        
        // Create new test user
        const user = new User({
            name: 'Test Admin',
            email: 'admin@test.com',
            password: 'admin123',
            role: 1
        });
        
        await user.save();
        console.log('✅ Test user created successfully!');
        console.log('Email: admin@test.com');
        console.log('Password: admin123');
        console.log('');
        console.log('You can now login to the frontend at http://localhost:3000');
        
    } catch (error) {
        console.error('❌ Error creating user:', error.message);
    }
    
    process.exit(0);
}

createTestUser();
