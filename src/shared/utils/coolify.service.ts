import { env } from '../../config/env.js'

/**
 * Coolify Service
 *
 * NOTE: With a Wildcard DNS record (`*.biponiq.com`) and a Wildcard domain
 * configured in Coolify (`https://*.biponiq.com`), there is NO need to
 * call the Coolify API to add/update/remove subdomains individually.
 *
 * Every vendor subdomain (e.g., vendor1.biponiq.com) is automatically
 * handled by Caddy/Coolify via the wildcard SSL certificate.
 *
 * Simply store the vendor's subdomain in the database — no API call needed.
 */

export const addDomainToCoolify = async (_subDomain: string): Promise<void> => {
  // No-op: Wildcard domain handles all subdomains automatically.
};

export const updateDomainInCoolify = async (_oldSubDomain: string, _newSubDomain: string): Promise<void> => {
  // No-op: Wildcard domain handles all subdomains automatically.
};

/**
 * Add Custom Domain to Coolify Application
 * This is required because wildcard domains do not cover external custom domains (e.g. vendor.com).
 */
export const addCustomDomainToCoolify = async (customDomain: string): Promise<void> => {
  try {
    const apiToken = env.COOLIFY_API_TOKEN;
    const appUuid = env.COOLIFY_FRONTEND_APP_UUID;
    const apiUrl = env.COOLIFY_API_URL;

    if (!apiToken || !appUuid || !apiUrl) {
      console.warn('Coolify API credentials are not fully configured in ENV. Custom domain not added to Coolify.');
      return;
    }

    // 1. Fetch current application details to get existing FQDNs
    const getRes = await fetch(`${apiUrl}/applications/${appUuid}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!getRes.ok) {
      throw new Error(`Failed to fetch Coolify app details: ${getRes.statusText}`);
    }

    const appData = await getRes.json();
    const existingFqdn = appData.fqdn || '';

    const cleanDomain = customDomain.replace(/^www\./i, '').toLowerCase();
    const fqdnsToAdd = [`https://${cleanDomain}`, `https://www.${cleanDomain}`];

    let updatedFqdn = existingFqdn;
    let modified = false;

    for (const fqdn of fqdnsToAdd) {
      if (!existingFqdn.includes(fqdn)) {
        updatedFqdn = updatedFqdn ? `${updatedFqdn},${fqdn}` : fqdn;
        modified = true;
      }
    }

    if (!modified) {
      return;
    }

    // 2. Update the application with the new FQDN list
    const patchRes = await fetch(`${apiUrl}/applications/${appUuid}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        domains: updatedFqdn,
      }),
    });

    if (!patchRes.ok) {
      throw new Error(`Failed to update Coolify app FQDN: ${patchRes.statusText}`);
    }

    console.log(`Successfully added custom domain ${customDomain} to Coolify.`);

    // 3. Automatically restart the application to apply the Traefik configuration changes
    console.log(`Triggering restart for application ${appUuid} to apply new domain labels...`);
    const restartRes = await fetch(`${apiUrl}/applications/${appUuid}/restart`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!restartRes.ok) {
      console.warn(`Failed to automatically restart application: ${restartRes.statusText}`);
    } else {
      console.log(`Successfully triggered application restart.`);
    }
  } catch (error) {
    console.error('Error adding custom domain to Coolify:', error);
  }
};
