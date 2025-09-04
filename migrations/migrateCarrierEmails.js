/**
 * Migration Script: Migrate Carrier Email Data to New Array Format
 * 
 * This script migrates existing carrier email data from legacy fields 
 * (email, secondary_email) to the new emails array format while maintaining
 * backward compatibility.
 */

const mongoose = require('mongoose');
const Carrier = require('../db/Carrier');
const { prepareEmailsForStorage } = require('../utils/carrierEmailUtils');

// Database connection (adjust according to your config)
const connectDB = async () => {
    try {
        const DB_URI = process.env.DATABASE_URI || 'mongodb://localhost:27017/emailscrap';
        await mongoose.connect(DB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Database connected successfully');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }
};

/**
 * Migrate carriers from legacy email fields to new emails array
 */
const migrateCarrierEmails = async () => {
    try {
        console.log('🚀 Starting carrier email migration...');
        
        // Find carriers that have legacy email fields but no emails array
        const carriersToMigrate = await Carrier.find({
            $and: [
                { deletedAt: { $exists: false } }, // Only active carriers
                {
                    $or: [
                        { emails: { $exists: false } },  // No emails array
                        { emails: { $size: 0 } }         // Empty emails array
                    ]
                },
                {
                    $or: [
                        { email: { $exists: true, $ne: null, $ne: '' } },
                        { secondary_email: { $exists: true, $ne: null, $ne: '' } }
                    ]
                }
            ]
        });
        
        console.log(`📊 Found ${carriersToMigrate.length} carriers to migrate`);
        
        if (carriersToMigrate.length === 0) {
            console.log('✅ No carriers need migration. All data is already up to date.');
            return;
        }
        
        let migratedCount = 0;
        let errorCount = 0;
        const errors = [];
        
        // Process carriers in batches
        const batchSize = 50;
        for (let i = 0; i < carriersToMigrate.length; i += batchSize) {
            const batch = carriersToMigrate.slice(i, i + batchSize);
            
            console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(carriersToMigrate.length/batchSize)} (${batch.length} carriers)`);
            
            for (const carrier of batch) {
                try {
                    // Prepare emails array from legacy fields
                    const emailsArray = prepareEmailsForStorage(
                        null, // no emails array provided
                        carrier.email, 
                        carrier.secondary_email
                    );
                    
                    if (emailsArray.length > 0) {
                        // Update carrier with new emails array
                        await Carrier.findByIdAndUpdate(
                            carrier._id,
                            {
                                $set: { 
                                    emails: emailsArray,
                                    updatedAt: new Date()
                                }
                            },
                            { runValidators: false } // Skip validation to prevent any conflicts during migration
                        );
                        
                        console.log(`✅ Migrated carrier ${carrier.name} (${carrier.mc_code}): ${emailsArray.length} emails`);
                        migratedCount++;
                    } else {
                        console.log(`⚠️ Skipped carrier ${carrier.name} (${carrier.mc_code}): No valid emails found`);
                    }
                    
                } catch (error) {
                    console.error(`❌ Error migrating carrier ${carrier.name} (${carrier.mc_code}):`, error.message);
                    errors.push({
                        carrierId: carrier._id,
                        carrierName: carrier.name,
                        mcCode: carrier.mc_code,
                        error: error.message
                    });
                    errorCount++;
                }
            }
        }
        
        // Print migration summary
        console.log('\n📈 MIGRATION SUMMARY:');
        console.log('====================');
        console.log(`✅ Successfully migrated: ${migratedCount} carriers`);
        console.log(`❌ Errors encountered: ${errorCount} carriers`);
        console.log(`📊 Total processed: ${carriersToMigrate.length} carriers`);
        
        if (errors.length > 0) {
            console.log('\n❌ ERRORS DETAILS:');
            console.log('==================');
            errors.forEach((error, index) => {
                console.log(`${index + 1}. Carrier: ${error.carrierName} (${error.mcCode})`);
                console.log(`   Error: ${error.error}\n`);
            });
        }
        
        console.log('✅ Migration completed successfully!');
        
    } catch (error) {
        console.error('💥 Migration failed:', error);
        throw error;
    }
};

/**
 * Verify migration results
 */
const verifyMigration = async () => {
    try {
        console.log('\n🔍 Verifying migration results...');
        
        // Count carriers with legacy data only
        const carriersWithLegacyOnly = await Carrier.countDocuments({
            $and: [
                { deletedAt: { $exists: false } },
                {
                    $or: [
                        { emails: { $exists: false } },
                        { emails: { $size: 0 } }
                    ]
                },
                {
                    $or: [
                        { email: { $exists: true, $ne: null, $ne: '' } },
                        { secondary_email: { $exists: true, $ne: null, $ne: '' } }
                    ]
                }
            ]
        });
        
        // Count carriers with new email arrays
        const carriersWithEmails = await Carrier.countDocuments({
            $and: [
                { deletedAt: { $exists: false } },
                { emails: { $exists: true, $not: { $size: 0 } } }
            ]
        });
        
        // Count total active carriers
        const totalActiveCarriers = await Carrier.countDocuments({
            deletedAt: { $exists: false }
        });
        
        console.log('📊 VERIFICATION RESULTS:');
        console.log('========================');
        console.log(`📈 Total active carriers: ${totalActiveCarriers}`);
        console.log(`✅ Carriers with email arrays: ${carriersWithEmails}`);
        console.log(`⚠️ Carriers still using legacy only: ${carriersWithLegacyOnly}`);
        
        if (carriersWithLegacyOnly === 0) {
            console.log('✅ All carriers have been successfully migrated!');
        } else {
            console.log(`⚠️ ${carriersWithLegacyOnly} carriers still need migration.`);
        }
        
    } catch (error) {
        console.error('❌ Verification failed:', error);
        throw error;
    }
};

/**
 * Main migration function
 */
const runMigration = async () => {
    try {
        await connectDB();
        await migrateCarrierEmails();
        await verifyMigration();
        
        console.log('\n🎉 Migration completed successfully!');
        process.exit(0);
        
    } catch (error) {
        console.error('💥 Migration failed:', error);
        process.exit(1);
    }
};

// Export functions for testing or manual execution
module.exports = {
    migrateCarrierEmails,
    verifyMigration,
    runMigration
};

// Run migration if this file is executed directly
if (require.main === module) {
    runMigration();
}
