import { assertManagedDomainPurchaseEnabled } from '../../../shared/errors/managedDomainPurchase.guard.js'
import { checkNamecheapDomainAvailability } from '../namecheap/namecheap.client.js'
import type { CheckDomainAvailabilityPayload } from './domainAvailability.validation.js'

const checkDomainAvailability = async (payload: CheckDomainAvailabilityPayload) => {
  await assertManagedDomainPurchaseEnabled()

  return checkNamecheapDomainAvailability(payload.domainName, payload.extensions)
}

export const DomainAvailabilityService = {
  checkDomainAvailability,
}
