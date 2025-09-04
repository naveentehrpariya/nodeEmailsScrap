/**
 * Carrier Email Utilities
 * Similar to customer email utilities but for carrier management
 */

/**
 * Get primary email from carrier data
 * @param {Object} carrier - Carrier document
 * @returns {String|null} Primary email or null
 */
const getPrimaryEmail = (carrier) => {
  if (!carrier) return null;
  
  // Check new emails array first
  if (carrier.emails && Array.isArray(carrier.emails) && carrier.emails.length > 0) {
    const primaryEmail = carrier.emails.find(emailObj => emailObj.is_primary);
    if (primaryEmail) {
      return primaryEmail.email;
    }
    // If no explicit primary, return first email
    return carrier.emails[0].email;
  }
  
  // Fallback to legacy email field
  return carrier.email || null;
};

/**
 * Get all emails from carrier data
 * @param {Object} carrier - Carrier document
 * @returns {Array} Array of email objects
 */
const getAllEmails = (carrier) => {
  if (!carrier) return [];
  
  // Return new emails array if it exists
  if (carrier.emails && Array.isArray(carrier.emails) && carrier.emails.length > 0) {
    return carrier.emails;
  }
  
  // Fallback to legacy fields
  const emails = [];
  if (carrier.email) {
    emails.push({
      email: carrier.email,
      is_primary: true,
      created_at: carrier.createdAt || new Date()
    });
  }
  if (carrier.secondary_email) {
    emails.push({
      email: carrier.secondary_email,
      is_primary: false,
      created_at: carrier.createdAt || new Date()
    });
  }
  
  return emails;
};

/**
 * Get secondary emails from carrier data
 * @param {Object} carrier - Carrier document
 * @returns {Array} Array of secondary email objects
 */
const getSecondaryEmails = (carrier) => {
  if (!carrier) return [];
  
  // Check new emails array first
  if (carrier.emails && Array.isArray(carrier.emails) && carrier.emails.length > 0) {
    return carrier.emails.filter(emailObj => !emailObj.is_primary);
  }
  
  // Fallback to legacy secondary_email field
  if (carrier.secondary_email) {
    return [{
      email: carrier.secondary_email,
      is_primary: false,
      created_at: carrier.createdAt || new Date()
    }];
  }
  
  return [];
};

/**
 * Add a new email to carrier
 * @param {Object} carrier - Carrier document
 * @param {String} email - Email to add
 * @param {Boolean} isPrimary - Whether this should be the primary email
 * @returns {Array} Updated emails array
 */
const addEmailToCarrier = (carrier, email, isPrimary = false) => {
  if (!carrier || !email) return [];
  
  const currentEmails = getAllEmails(carrier);
  
  // If setting as primary, unset other primary emails
  if (isPrimary) {
    currentEmails.forEach(emailObj => {
      emailObj.is_primary = false;
    });
  }
  
  // Add new email
  currentEmails.push({
    email: email,
    is_primary: isPrimary,
    created_at: new Date()
  });
  
  return currentEmails;
};

/**
 * Remove email from carrier
 * @param {Object} carrier - Carrier document
 * @param {String} emailToRemove - Email to remove
 * @returns {Array} Updated emails array
 */
const removeEmailFromCarrier = (carrier, emailToRemove) => {
  if (!carrier || !emailToRemove) return [];
  
  const currentEmails = getAllEmails(carrier);
  return currentEmails.filter(emailObj => emailObj.email !== emailToRemove);
};

/**
 * Set email as primary for carrier
 * @param {Object} carrier - Carrier document
 * @param {String} emailToSetPrimary - Email to set as primary
 * @returns {Array} Updated emails array
 */
const setPrimaryEmail = (carrier, emailToSetPrimary) => {
  if (!carrier || !emailToSetPrimary) return [];
  
  const currentEmails = getAllEmails(carrier);
  
  // Unset all primary flags first
  currentEmails.forEach(emailObj => {
    emailObj.is_primary = false;
  });
  
  // Set the specified email as primary
  const targetEmail = currentEmails.find(emailObj => emailObj.email === emailToSetPrimary);
  if (targetEmail) {
    targetEmail.is_primary = true;
  }
  
  return currentEmails;
};

/**
 * Validate email format
 * @param {String} email - Email to validate
 * @returns {Boolean} True if valid email format
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Prepare emails array for database storage
 * @param {Array|String} emails - Emails input (array or single email)
 * @param {String} legacyEmail - Legacy email field for backward compatibility
 * @param {String} legacySecondaryEmail - Legacy secondary email field
 * @returns {Array} Prepared emails array for storage
 */
const prepareEmailsForStorage = (emails, legacyEmail = null, legacySecondaryEmail = null) => {
  let emailsArray = [];
  
  // If emails array is provided, use it
  if (emails && Array.isArray(emails) && emails.length > 0) {
    emailsArray = emails.map((emailItem, index) => ({
      email: emailItem.email || emailItem, // Support both object and string format
      is_primary: emailItem.is_primary !== undefined ? emailItem.is_primary : index === 0,
      created_at: emailItem.created_at || new Date()
    })).filter(emailObj => isValidEmail(emailObj.email)); // Only include valid emails
  } else {
    // Fallback to legacy fields for backward compatibility
    if (legacyEmail && isValidEmail(legacyEmail)) {
      emailsArray.push({
        email: legacyEmail,
        is_primary: true,
        created_at: new Date()
      });
    }
    if (legacySecondaryEmail && isValidEmail(legacySecondaryEmail)) {
      emailsArray.push({
        email: legacySecondaryEmail,
        is_primary: false,
        created_at: new Date()
      });
    }
  }
  
  // Ensure at least one email is primary if emails exist
  if (emailsArray.length > 0) {
    const hasPrimary = emailsArray.some(emailObj => emailObj.is_primary);
    if (!hasPrimary) {
      emailsArray[0].is_primary = true;
    }
  }
  
  return emailsArray;
};

/**
 * Get emails in legacy format for backward compatibility
 * @param {Object} carrier - Carrier document
 * @returns {Object} Object with email and secondary_email fields
 */
const getLegacyEmailFormat = (carrier) => {
  if (!carrier) return { email: null, secondary_email: null };
  
  const allEmails = getAllEmails(carrier);
  const primaryEmail = allEmails.find(emailObj => emailObj.is_primary);
  const secondaryEmails = allEmails.filter(emailObj => !emailObj.is_primary);
  
  return {
    email: primaryEmail ? primaryEmail.email : null,
    secondary_email: secondaryEmails.length > 0 ? secondaryEmails[0].email : null
  };
};

module.exports = {
  getPrimaryEmail,
  getAllEmails,
  getSecondaryEmails,
  addEmailToCarrier,
  removeEmailFromCarrier,
  setPrimaryEmail,
  isValidEmail,
  prepareEmailsForStorage,
  getLegacyEmailFormat
};
