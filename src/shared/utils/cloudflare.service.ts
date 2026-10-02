import { env } from '../../config/env.js'

export const CloudflareService = {
  /**
   * Add a custom hostname to Cloudflare for SaaS
   */
  async addCustomHostname(hostname: string) {
    const apiToken = env.CLOUDFLARE_API_TOKEN;
    const zoneId = env.CLOUDFLARE_ZONE_ID;

    if (!apiToken || !zoneId) {
      throw new Error('Cloudflare credentials not configured in environment variables.');
    }

    const cleanHostname = hostname.toLowerCase().trim();

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hostname: cleanHostname,
        ssl: {
          method: 'http',
          type: 'dv',
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Cloudflare API Error Response:', data);
      const errorMsg = data.errors?.[0]?.message || 'Unknown error adding custom hostname to Cloudflare';
      throw new Error(`Cloudflare API Error: ${errorMsg}`);
    }

    return data.result;
  },

  /**
   * Get status and verification records for a custom hostname
   */
  async getCustomHostnameStatus(cloudflareId: string) {
    const apiToken = env.CLOUDFLARE_API_TOKEN;
    const zoneId = env.CLOUDFLARE_ZONE_ID;

    if (!apiToken || !zoneId) {
      throw new Error('Cloudflare credentials not configured in environment variables.');
    }

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames/${cloudflareId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.errors?.[0]?.message || 'Unknown error fetching custom hostname from Cloudflare';
      throw new Error(`Cloudflare API Error: ${errorMsg}`);
    }

    return data.result;
  },

  /**
   * Delete a custom hostname from Cloudflare
   */
  async deleteCustomHostname(cloudflareId: string) {
    const apiToken = env.CLOUDFLARE_API_TOKEN;
    const zoneId = env.CLOUDFLARE_ZONE_ID;

    if (!apiToken || !zoneId) {
      throw new Error('Cloudflare credentials not configured in environment variables.');
    }

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames/${cloudflareId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.errors?.[0]?.message || 'Unknown error deleting custom hostname from Cloudflare';
      throw new Error(`Cloudflare API Error: ${errorMsg}`);
    }

  },

  /**
   * Purge cache for specific hostnames (domains/subdomains)
   */
  async purgeCacheByHostnames(hostnames: string[]) {
    const apiToken = env.CLOUDFLARE_API_TOKEN;
    const zoneId = env.CLOUDFLARE_ZONE_ID;

    if (!apiToken || !zoneId) {
      console.warn('Cloudflare credentials not configured. Skipping cache purge.');
      return null;
    }
    
    if (!hostnames || hostnames.length === 0) return null;

    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          purge_everything: true
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Cloudflare Cache Purge Error:', data);
        return false;
      }

      console.log(`Cloudflare cache purged successfully for hosts: ${hostnames.join(', ')}`);
      return true;
    } catch (err) {
      console.error('Failed to purge Cloudflare cache:', err);
      return false;
    }
  }
}
