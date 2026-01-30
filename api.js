const https = require('https');

const BASE_URL = 'claude.ai';

function makeRequest(path, sessionKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      path: '/api' + path,
      method: 'GET',
      headers: {
        'Cookie': `sessionKey=${sessionKey}`,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          reject(new Error('SESSION_EXPIRED'));
        } else if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
        } else {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid JSON response'));
          }
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

async function getOrganizations(sessionKey) {
  return makeRequest('/organizations', sessionKey);
}

async function getUsageData(sessionKey, orgId) {
  return makeRequest(`/organizations/${orgId}/usage`, sessionKey);
}

async function getUsage(sessionKey) {
  // Get organization ID first
  const orgs = await getOrganizations(sessionKey);
  
  if (!orgs || orgs.length === 0) {
    throw new Error('No organizations found');
  }
  
  const orgId = orgs[0].uuid;
  const usageData = await getUsageData(sessionKey, orgId);
  
  return parseUsage(usageData);
}

function parseUsage(data) {
  // API returns:
  // - five_hour.utilization = percentage USED in 5-hour window
  // - seven_day.utilization = percentage USED in 7-day window
  
  let sessionUsedPct = 0;
  let weeklyUsedPct = 0;
  
  if (data.five_hour && typeof data.five_hour.utilization === 'number') {
    sessionUsedPct = data.five_hour.utilization;
  }
  
  if (data.seven_day && typeof data.seven_day.utilization === 'number') {
    weeklyUsedPct = data.seven_day.utilization;
  }
  
  // Calculate percentage REMAINING
  const sessionRemaining = Math.max(0, Math.round(100 - sessionUsedPct));
  const weeklyRemaining = Math.max(0, Math.round(100 - weeklyUsedPct));
  
  return {
    session: sessionRemaining,
    weekly: weeklyRemaining,
    sessionUsedPct,
    weeklyUsedPct,
    fiveHourResetsAt: data.five_hour?.resets_at,
    sevenDayResetsAt: data.seven_day?.resets_at,
    raw: data
  };
}

module.exports = { getUsage };
