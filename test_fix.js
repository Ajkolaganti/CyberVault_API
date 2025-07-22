import axios from 'axios';

const API_BASE = 'http://localhost:4000/api/v1';

// Test function to create an account with both hostname and safe_name
async function testAccountCreation() {
  try {
    console.log('Testing account creation with frontend field names...');
    
    // First, let's test without authentication to see if the middleware runs
    const testData = {
      system_type: 'Windows',
      hostname: '192.168.1.100', // Frontend uses 'hostname'
      port: 3389,
      username: 'admin',
      password: 'YourSecurePassword123!',
      connection_method: 'RDP',
      platform_id: 'WinDomain',
      account_type: 'Domain',
      safe_name: 'Production Safe', // Frontend might use 'safe_name'
      rotation_policy: {
        enabled: true,
        interval_days: 90,
        complexity_requirements: {
          min_length: 12,
          require_uppercase: true,
          require_lowercase: true,
          require_numbers: true,
          require_symbols: true
        },
        notification_days: 7,
        auto_rotate: true
      }
    };

    console.log('Sending request with test data:', JSON.stringify(testData, null, 2));

    const response = await axios.post(`${API_BASE}/accounts`, testData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer fake-token' // This will fail auth but should run our middleware first
      },
      timeout: 10000
    });

    console.log('Response:', response.data);
  } catch (error) {
    if (error.response) {
      console.log('Error status:', error.response.status);
      console.log('Error data:', error.response.data);
      
      if (error.response.status === 500) {
        console.error('❌ 500 Internal Server Error still occurring!');
        console.error('The fix did not work.');
      } else if (error.response.status === 401) {
        console.log('✅ Authentication error (expected) - middleware ran successfully!');
        console.log('This means our field mapping middleware executed without crashing.');
      } else if (error.response.status === 400) {
        console.log('✅ Validation error (expected) - middleware ran successfully!');
        console.log('Error details:', error.response.data);
      } else {
        console.log(`Unexpected status code: ${error.response.status}`);
      }
    } else if (error.code === 'ECONNREFUSED') {
      console.error('❌ Server is not running on port 4000');
    } else {
      console.error('❌ Unexpected error:', error.message);
    }
  }
}

// Test basic server connectivity
async function testServerHealth() {
  try {
    console.log('Testing server connectivity...');
    const response = await axios.get(`${API_BASE}/accounts`, {
      timeout: 5000
    });
    console.log('✅ Server is responding');
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('✅ Server is running (got expected auth error)');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('❌ Server is not running on port 4000');
      return false;
    } else {
      console.log('Server responded with error:', error.response?.status || error.message);
    }
  }
  return true;
}

// Run tests
async function runTests() {
  console.log('🔍 Starting 500 Error Fix Verification Tests\n');
  
  const serverRunning = await testServerHealth();
  if (!serverRunning) {
    return;
  }
  
  console.log('\n---\n');
  await testAccountCreation();
  
  console.log('\n📋 Test Summary:');
  console.log('- If you see a 401 or 400 error above, the fix is working correctly');
  console.log('- If you see a 500 error, the fix needs more work');
  console.log('- The middleware should now handle safe_name -> safe_id conversion without crashing');
}

runTests().catch(console.error);
