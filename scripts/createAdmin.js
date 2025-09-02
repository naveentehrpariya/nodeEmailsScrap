const mongoose = require('mongoose');
const User = require('../db/Users');
const bcrypt = require('bcrypt');
require('dotenv').config();

const createAdmin = async () => {
    try {
        // Connect to database using existing connection config
        mongoose.set('strictQuery', true);
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/emailscrap', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Connected to database');

        // Check if admin already exists
        const existingAdmin = await User.findOne({ email: 'admin@crossmilescarrier.com' });
        
        if (existingAdmin) {
            console.log('❌ Admin user already exists!');
            console.log('Admin details:', {
                name: existingAdmin.name,
                email: existingAdmin.email,
                role: existingAdmin.role
            });
            process.exit(0);
        }

        // Create admin user
        const adminUser = new User({
            name: 'Admin',
            email: 'admin@crossmilescarrier.com',
            password: 'admin123', // Will be hashed by pre-save middleware
            role: 1
        });

        const savedAdmin = await adminUser.save();
        savedAdmin.password = undefined; // Remove password from output

        console.log('✅ Admin user created successfully!');
        console.log('Admin credentials:');
        console.log('  Email: admin@crossmilescarrier.com');
        console.log('  Password: admin123');
        console.log('');
        console.log('User details:', {
            id: savedAdmin._id,
            name: savedAdmin.name,
            email: savedAdmin.email,
            role: savedAdmin.role
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating admin user:', error);
        process.exit(1);
    }
};

// Run if this script is executed directly
if (require.main === module) {
    createAdmin();
}

module.exports = createAdmin;
