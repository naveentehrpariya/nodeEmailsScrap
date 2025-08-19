import React, { useState, useEffect, useCallback } from 'react';

const AllAccounts = () => {
  const [search, setSearch] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [localFilteredAccounts, setLocalFilteredAccounts] = useState([]);

  // Debounce helper function
  const debounce = useCallback((func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }, []);

  // Function to fetch accounts from API
  const fetchAccounts = useCallback(async (searchTerm = '') => {
    try {
      setLoading(true);
      
      // Build API URL with search parameter if provided
      const queryParams = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '';
      const response = await fetch(`/api/accounts${queryParams}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          // Add authorization header if needed
          // 'Authorization': `Bearer ${token}`
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.status) {
        setAccounts(data.accounts || []);
        setLocalFilteredAccounts(data.accounts || []);
      } else {
        console.error('Failed to fetch accounts:', data.message);
        setAccounts([]);
        setLocalFilteredAccounts([]);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setAccounts([]);
      setLocalFilteredAccounts([]);
    } finally {
      setLoading(false);
      if (initialLoading) {
        setInitialLoading(false);
      }
    }
  }, [initialLoading]);

  // Debounced version of fetchAccounts
  const debouncedFetchAccounts = useCallback(
    debounce((searchTerm) => {
      fetchAccounts(searchTerm);
    }, 300), // 300ms delay
    [fetchAccounts]
  );

  // Local filtering function (fallback while API loads)
  const filterLocalAccounts = useCallback((searchTerm) => {
    if (!searchTerm) {
      setLocalFilteredAccounts(accounts);
      return;
    }

    const filtered = accounts.filter(account =>
      account.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setLocalFilteredAccounts(filtered);
  }, [accounts]);

  // Handle search input change
  const handleSearchChange = (e) => {
    const searchTerm = e.target.value;
    setSearch(searchTerm);

    // Instantly filter local accounts as fallback
    filterLocalAccounts(searchTerm);

    // Debounced API call
    debouncedFetchAccounts(searchTerm);
  };

  // Initial load
  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Loading spinner component
  const LoadingSpinner = () => (
    <div className="flex items-center justify-center py-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      <span className="ml-2 text-gray-600">Loading accounts...</span>
    </div>
  );

  // No accounts found component
  const NoAccountsFound = () => (
    <div className="text-center py-8">
      <div className="text-gray-500 text-lg mb-2">No accounts found</div>
      {search && (
        <div className="text-gray-400 text-sm">
          No accounts match your search for "{search}"
        </div>
      )}
    </div>
  );

  // Account list item component
  const AccountItem = ({ account }) => (
    <div 
      key={account._id} 
      className="bg-white border border-gray-200 rounded-lg p-4 mb-3 hover:shadow-md transition-shadow duration-200"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="text-lg font-medium text-gray-900 mb-1">
            {account.email}
          </div>
          <div className="text-sm text-gray-500">
            Last sync: {account.lastSync ? new Date(account.lastSync).toLocaleString() : 'Never'}
          </div>
          <div className="text-sm text-gray-500">
            Created: {new Date(account.createdAt).toLocaleString()}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button 
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors duration-200"
            onClick={() => {
              // Handle view action
              console.log('View account:', account._id);
            }}
          >
            View
          </button>
          <button 
            className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 transition-colors duration-200"
            onClick={() => {
              // Handle sync action
              console.log('Sync account:', account._id);
            }}
          >
            Sync
          </button>
          <button 
            className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors duration-200"
            onClick={() => {
              // Handle delete action
              console.log('Delete account:', account._id);
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">All Accounts</h1>
        
        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search accounts by email..."
            value={search}
            onChange={handleSearchChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('');
                setLocalFilteredAccounts(accounts);
                fetchAccounts();
              }}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        
        {/* Search Results Info */}
        {search && !loading && (
          <div className="mt-2 text-sm text-gray-600">
            {localFilteredAccounts.length === 1 
              ? `Found 1 account matching "${search}"`
              : `Found ${localFilteredAccounts.length} accounts matching "${search}"`
            }
          </div>
        )}
      </div>

      {/* Loading State */}
      {initialLoading && <LoadingSpinner />}

      {/* Loading indicator for search */}
      {loading && !initialLoading && (
        <div className="mb-4">
          <div className="flex items-center text-sm text-gray-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
            Searching...
          </div>
        </div>
      )}

      {/* Accounts List */}
      {!initialLoading && (
        <div>
          {localFilteredAccounts.length === 0 ? (
            <NoAccountsFound />
          ) : (
            <div>
              {localFilteredAccounts.map(account => (
                <AccountItem key={account._id} account={account} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Account Button */}
      <div className="mt-6 text-center">
        <button 
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
          onClick={() => {
            // Handle add account action
            console.log('Add new account');
          }}
        >
          Add New Account
        </button>
      </div>
    </div>
  );
};

export default AllAccounts;
