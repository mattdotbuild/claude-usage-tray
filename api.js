const https = require('https');
const crypto = require('crypto');

const BASE_URL = 'claude.ai';

// Build Cookie header: use full cookie string if available, fall back to sessionKey only
function buildCookieHeader(sessionKey) {
  if (typeof sessionKey === 'object' && sessionKey.cookies) {
    return sessionKey.cookies;
  }
  return `sessionKey=${sessionKey}`;
}

// Extract the raw sessionKey string for backward compat
function getSessionKeyValue(sessionKey) {
  if (typeof sessionKey === 'object' && sessionKey.cookies) {
    return sessionKey;
  }
  return sessionKey;
}

function makeRequest(path, sessionKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      path: '/api' + path,
      method: 'GET',
      headers: {
        'Cookie': buildCookieHeader(sessionKey),
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

function makeRequestWithBody(method, path, sessionKey, body, accept = 'application/json') {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: BASE_URL,
      path: '/api' + path,
      method: method,
      headers: {
        'Cookie': buildCookieHeader(sessionKey),
        'Accept': accept,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          reject(new Error('SESSION_EXPIRED'));
        } else if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        } else {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            // Response may be SSE or empty - that's fine
            resolve(data);
          }
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(bodyStr);
    req.end();
  });
}

function makeDeleteRequest(path, sessionKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      path: '/api' + path,
      method: 'DELETE',
      headers: {
        'Cookie': buildCookieHeader(sessionKey),
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
        } else if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
        } else {
          resolve();
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

async function sendHeartbeat(sessionKey) {
  const orgs = await getOrganizations(sessionKey);
  if (!orgs || orgs.length === 0) throw new Error('No organizations found');

  const orgId = orgs[0].uuid;
  const convId = crypto.randomUUID();

  try {
    // Create a new conversation
    await makeRequestWithBody('POST', `/organizations/${orgId}/chat_conversations`, sessionKey, {
      uuid: convId,
      name: ''
    });

    // Send a minimal message to trigger token usage and start the 5h window
    await makeRequestWithBody(
      'POST',
      `/organizations/${orgId}/chat_conversations/${convId}/completion`,
      sessionKey,
      {
        prompt: 'hi',
        timezone: 'UTC'
      },
      'text/event-stream'
    );

    // Delete the conversation to keep things clean
    try {
      await makeDeleteRequest(`/organizations/${orgId}/chat_conversations/${convId}`, sessionKey);
    } catch (e) {
      console.error('Heartbeat: failed to delete conversation:', e.message);
    }

    return true;
  } catch (error) {
    // Try to clean up even if the message failed
    try {
      await makeDeleteRequest(`/organizations/${orgId}/chat_conversations/${convId}`, sessionKey);
    } catch (e) {}
    throw error;
  }
}

module.exports = { getUsage, sendHeartbeat };
