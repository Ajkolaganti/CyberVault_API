import axios from 'axios';

const API_BASE = 'http://localhost:4000/api/v1';

// Test function with the exact request data from frontend
async function testActualFrontendRequest() {
  try {
    console.log('Testing with actual frontend request data...');
    
    // This matches the actual frontend request you showed
    const testData = {
      name: "test",
      system_type: "Windows", 
      hostname: "test", // This should map to hostname_ip
      username: "test",
      password: "test",
      account_description: "test",
      platform_id: "12",
      safe_name: "12", // This should map to safe_id
      account_type: "Domain"
    };

    console.log('Sending exact frontend request:', JSON.stringify(testData, null, 2));

    const response = await axios.post(`${API_BASE}/accounts`, testData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer fake-token' // Will fail auth but middleware should run
      },
      timeout: 10000
    });

    console.log('Response:', response.data);
  } catch (error) {
    if (error.response) {
      console.log('❌ Error status:', error.response.status);
      console.log('❌ Error data:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 500) {
        console.error('🚨 500 Internal Server Error confirmed!');
        console.error('The middleware is still crashing.');
        
        // Check if there are more details in the error
        if (error.response.data && error.response.data.stack) {
          console.error('Stack trace:', error.response.data.stack);
        }
      } else {
        console.log('✅ No 500 error - middleware working!');
      }
    } else {
      console.error('Network error:', error.message);
    }
  }
}

// Also test without safe_name to isolate the issue
async function testWithoutSafeName() {
  try {
    console.log('\nTesting without safe_name...');
    
    const testData = {
      name: "test",
      system_type: "Windows", 
      hostname: "test",
      username: "test",
      password: "test",
      account_description: "test",
      platform_id: "12",
      account_type: "Domain"
      // No safe_name - should work fine
    };

    console.log('Sending request without safe_name:', JSON.stringify(testData, null, 2));

    const response = await axios.post(`${API_BASE}/accounts`, testData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer fake-token'
      },
      timeout: 10000
    });

    console.log('Response:', response.data);
  } catch (error) {
    if (error.response) {
      console.log('Error status:', error.response.status);
      console.log('Error data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Network error:', error.message);
    }
  }
}

async function runDebugTests() {
  console.log('🔍 Debugging 500 Error from Frontend Request\n');
  
  await testActualFrontendRequest();
  await testWithoutSafeName();
  
  console.log('\n📋 Debug Summary:');
  console.log('- Compare the results above to identify where the 500 error occurs');
  console.log('- If both fail with 500, the issue is in basic middleware');
  console.log('- If only the safe_name test fails, the issue is in safe lookup');
}

runDebugTests().catch(console.error);
