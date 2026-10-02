import { prisma } from './src/lib/prisma.js';

function generateVendorCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomPart = '';
  
  for (let i = 0; i < 8; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return `BPNQ-${randomPart}`;
}

async function main() {
  const vendorsToUpdate = await prisma.vendor.findMany({
    where: {
      OR: [
        { vendorCode: null },
        { vendorCode: '' },
        { vendorCode: { not: { startsWith: 'BPNQ-' } } }
      ]
    }
  });

  console.log(`Found ${vendorsToUpdate.length} vendors to update.`);

  for (const vendor of vendorsToUpdate) {
    let code = generateVendorCode();
    let isUnique = false;
    
    // Check if the generated code is unique
    while (!isUnique) {
      const existingVendor = await prisma.vendor.findUnique({
        where: { vendorCode: code }
      });
      if (!existingVendor) {
        isUnique = true;
      } else {
        code = generateVendorCode();
      }
    }

    await prisma.vendor.update({
      where: { id: vendor.id },
      data: { vendorCode: code }
    });
    
    console.log(`Updated vendor ${vendor.id} with code ${code}`);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
