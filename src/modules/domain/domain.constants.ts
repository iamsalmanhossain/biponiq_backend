export const ALLOWED_DOMAIN_EXTENSIONS = ['.com', '.net', '.shop', '.store', '.online'] as const

export type AllowedDomainExtension = (typeof ALLOWED_DOMAIN_EXTENSIONS)[number]

export const DOMAIN_REGISTRATION_YEARS = 1
