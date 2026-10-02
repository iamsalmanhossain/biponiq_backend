import dns from 'dns'
import { prisma } from '../../../../lib/prisma.js'
import AppError from '../../../../shared/errors/AppError.js'
import { StatusCodes } from 'http-status-codes'
import { CloudflareService } from '../../../../shared/utils/cloudflare.service.js'

// custom domain add feature

const extractDomainName = (url: string) => {
  try {
    const validUrl = url.startsWith('http') ? url : `https://${url}`
    const parsedUrl = new URL(validUrl)
    return parsedUrl.hostname.replace(/^www\./, '') // Remove 'www.' if present
  } catch (error) {
    return url // Return the original URL if parsing fails
  }
}

// add custom domain for vendor
const addCustomDomain = async (userId: string, requestedDomain: string) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
  })
  if (!vendor) {
    throw new Error('Vendor not found for the given userId.')
  }
  const vendorId = vendor.id
  const cleanDomain = extractDomainName(requestedDomain)

  // check if the domain is already in use by another vendor
  const existingDomain = await prisma.customDomain.findUnique({
    where: { domain: cleanDomain },
  })

  if (existingDomain && existingDomain.vendorId !== vendorId) {
    throw new Error('This domain is already in use by another vendor.')
  }

  // 1. Add Custom Hostname to Cloudflare
  let cloudflareResult;
  let cloudflareWwwResult;
  try {
    cloudflareResult = await CloudflareService.addCustomHostname(cleanDomain);
    cloudflareWwwResult = await CloudflareService.addCustomHostname(`www.${cleanDomain}`);
  } catch (error: any) {
    throw new Error(`Failed to add custom domain to Cloudflare: ${error.message}`);
  }

  const cloudflareId = cloudflareResult.id;
  const cloudflareStatus = cloudflareResult.status;
  const cloudflareWwwId = cloudflareWwwResult?.id;
  const cloudflareWwwStatus = cloudflareWwwResult?.status;
  
  const verificationRecords = cloudflareResult.ownership_verification || {};

  // update or create the custom domain for the vendor
  const newDomain = await prisma.customDomain.upsert({
    where: { vendorId },
    update: {
      domain: cleanDomain,
      status: 'PENDING',
      cloudflareId,
      cloudflareStatus,
      cloudflareWwwId,
      cloudflareWwwStatus,
      verificationRecords,
    },
    create: {
      domain: cleanDomain,
      vendorId,
      status: 'PENDING',
      cloudflareId,
      cloudflareStatus,
      cloudflareWwwId,
      cloudflareWwwStatus,
      verificationRecords,
    },
  })

  // Provide Cloudflare specific verification instructions
  const connectDomain = process.env.PLATFORM_CONNECT_DOMAIN || 'connect.biponiq.com'
  const dnsInstructions = {
    ownershipVerification: verificationRecords,
    rootCname: {
      type: 'CNAME',
      name: '@',
      value: connectDomain,
    },
    wwwCname: {
      type: 'CNAME',
      name: 'www',
      value: connectDomain,
    },
  }
  return {
    domainInfo: newDomain,
    instructions: dnsInstructions,
  }
}

// verify custom domain for vendor
const verifyCustomDomain = async (userId: string) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
  })
  if (!vendor) {
    throw new Error('Vendor not found for the given userId.')
  }

  const customDomain = await prisma.customDomain.findUnique({
    where: { vendorId: vendor.id },
  })

  if (!customDomain) {
    throw new Error('No custom domain found for this vendor.')
  }

  // ১. Development Mode Check
  if (process.env.NODE_ENV === 'development' || customDomain.domain.includes('localhost')) {
    return await prisma.customDomain.update({
      where: { id: customDomain.id },
      data: { status: 'VERIFIED', cloudflareStatus: 'active' },
    })
  }

  // 2. Cloudflare Verification Check
  if (!customDomain.cloudflareId) {
    throw new Error('Cloudflare ID not found for this custom domain. Please remove and re-add the domain.');
  }

  let cloudflareStatusInfo;
  let cloudflareWwwStatusInfo;
  try {
    cloudflareStatusInfo = await CloudflareService.getCustomHostnameStatus(customDomain.cloudflareId);
    if (customDomain.cloudflareWwwId) {
      cloudflareWwwStatusInfo = await CloudflareService.getCustomHostnameStatus(customDomain.cloudflareWwwId);
    }
  } catch (error: any) {
    throw new Error(`Failed to check status with Cloudflare: ${error.message}`);
  }

  // Update records with latest info. Consider VERIFIED if the root domain is active.
  const newStatus = cloudflareStatusInfo.status === 'active' ? 'VERIFIED' : 'PENDING';
  
  const updatedDomain = await prisma.customDomain.update({
    where: { id: customDomain.id },
    data: { 
      status: newStatus,
      cloudflareStatus: cloudflareStatusInfo.status,
      cloudflareWwwStatus: cloudflareWwwStatusInfo?.status || customDomain.cloudflareWwwStatus,
      verificationRecords: cloudflareStatusInfo.ownership_verification || customDomain.verificationRecords,
    },
  })

  if (newStatus === 'VERIFIED') {
    return updatedDomain;
  } else {
    throw new Error(`Connection Verification failed. Cloudflare status is: ${cloudflareStatusInfo.status}. Please check your DNS settings.`);
  }
}

// delete custom domain
const deleteCustomDomain = async (userId: string) => {
    const vendor= await prisma.vendor.findUnique({
        where:{userId}
    })
    if(!vendor){
          throw new AppError( StatusCodes.NOT_FOUND,'Vendor not found for the given userId.' )
    }
    const existingDomain = await prisma.customDomain.findUnique({
        where:{vendorId: vendor.id}
    })
    if(!existingDomain){
        throw new AppError( StatusCodes.NOT_FOUND,'No custom domain found for this vendor.' )
    }

    // Remove from Cloudflare first
    if (existingDomain.cloudflareId) {
      try {
        await CloudflareService.deleteCustomHostname(existingDomain.cloudflareId);
      } catch (error: any) {
        console.error(`Failed to delete custom hostname from Cloudflare: ${error.message}`);
        // We continue deleting from our DB even if Cloudflare fails, to prevent user being stuck
      }
    }
    
    if (existingDomain.cloudflareWwwId) {
      try {
        await CloudflareService.deleteCustomHostname(existingDomain.cloudflareWwwId);
      } catch (error: any) {
        console.error(`Failed to delete www custom hostname from Cloudflare: ${error.message}`);
      }
    }

    const deleteDomain= await prisma.customDomain.delete({
        where:{id:existingDomain.id}
    })
    return deleteDomain
}

// get custom domain
const getCustomDomain = async(userId:string)=>{
    const vendor = await prisma.vendor.findUnique({
        where :{userId}
    })
    if(!vendor){
        throw new AppError(StatusCodes.NOT_FOUND, 'Vendor not found for the given userId')
    }
    const customDomain = await prisma.customDomain.findUnique({
        where:{vendorId:vendor.id}
    })
    return customDomain
}

export const CustomDomainService = {
  addCustomDomain,
  verifyCustomDomain,
  deleteCustomDomain,
  getCustomDomain,
}
