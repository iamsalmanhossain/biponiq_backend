import PDFDocument from 'pdfkit'

export type SubscriptionReceiptData = {
  receiptNo: string
  transactionId: string
  vendorName: string
  vendorEmail?: string | null
  planName: string
  planAmount: number
  setupFee: number
  isInstallmentIncluded: boolean

  isDomainIncluded: boolean
  domain?: string | null
  domainExtension?: string | null
  domainRegistrationYears?: number | null
  domainAmount: number

  couponCode?: string | null
  discountAmount: number
  billingCycle: string
  amount: number
  paymentMethod: string
  status: string
  paidAt: Date
}

export const formatFullDomain = (domain?: string | null, extension?: string | null): string => {
  if (!domain || !domain.trim()) return '-'
  const trimmedDomain = domain.trim()
  if (!extension || !extension.trim()) return trimmedDomain

  const trimmedExt = extension.trim()
  const cleanExt = trimmedExt.startsWith('.') ? trimmedExt : `.${trimmedExt}`
  if (cleanExt === '.') return trimmedDomain

  if (trimmedDomain.toLowerCase().endsWith(cleanExt.toLowerCase())) {
    return trimmedDomain
  }

  return `${trimmedDomain}${cleanExt}`
}

const formatDate = (date: Date) =>
  date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

const formatCycle = (cycle: string) => {
  const map: Record<string, string> = {
    MONTHLY: 'Monthly',
    SIX_MONTHS: '6 Months',
    YEARLY: 'Yearly',
  }

  return map[cycle] ?? cycle
}

const drawRow = (doc: PDFKit.PDFDocument, label: string, value: string, y: number) => {
  doc.fillColor('#6B7280').fontSize(9).text(label, 60, y)
  doc.fillColor('#111827').fontSize(11).text(value, 220, y)
}

export const generateSubscriptionReceiptPdf = (data: SubscriptionReceiptData) => {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
  })

  const chunks: Buffer[] = []

  doc.on('data', (chunk) => chunks.push(chunk))

  const pdfBufferPromise = new Promise<Buffer>((resolve) => {
    doc.on('end', () => {
      resolve(Buffer.concat(chunks))
    })
  })

  // Header
  doc.rect(0, 0, 595, 130).fill('#EAF2F8')
  doc.moveTo(0, 130).lineTo(595, 130).stroke('#D8E2EC')

  doc.fillColor('#111827').fontSize(26).text('Biponiq', 50, 42)
  doc.fillColor('#6B7280').fontSize(10).text('Subscription Payment Receipt', 50, 78)

  doc.roundedRect(410, 42, 115, 34, 8).fill('#10B981')
  doc.fillColor('#FFFFFF').fontSize(12).text(data.status, 410, 53, {
    width: 115,
    align: 'center',
  })

  // Receipt meta card
  doc.roundedRect(50, 160, 495, 82, 12).stroke('#E5E7EB')

  drawRow(doc, 'Receipt No', data.receiptNo, 180)
  drawRow(doc, 'Transaction ID', data.transactionId, 203)
  drawRow(doc, 'Paid At', formatDate(data.paidAt), 226)

  // Vendor section
  doc.fillColor('#111827').fontSize(14).text('Vendor Information', 50, 280)
  doc.moveTo(50, 302).lineTo(545, 302).stroke('#E5E7EB')

  drawRow(doc, 'Store Name', data.vendorName, 326)
  drawRow(doc, 'Email', data.vendorEmail ?? '-', 349)

  // Subscription section
  doc.fillColor('#111827').fontSize(14).text('Subscription Details', 50, 395)
  doc.moveTo(50, 417).lineTo(545, 417).stroke('#E5E7EB')

  drawRow(doc, 'Plan', data.planName, 441)
  drawRow(doc, 'Billing Cycle', formatCycle(data.billingCycle), 464)
  drawRow(doc, 'Payment Method', data.paymentMethod, 487)
  drawRow(doc, 'Plan Amount', `BDT ${data.planAmount}`, 510)

  let nextRowY = 533

  if (data.discountAmount > 0) {
    drawRow(
      doc,
      data.couponCode ? `Coupon Discount (${data.couponCode})` : 'Coupon Discount',
      `-BDT ${data.discountAmount}`,
      nextRowY
    )

    nextRowY += 23
  }

  if (data.isInstallmentIncluded) {
    drawRow(doc, 'Setup Fee', `BDT ${data.setupFee}`, nextRowY)

    nextRowY += 23
  }

  if (data.isDomainIncluded) {
    const fullDomain = formatFullDomain(data.domain, data.domainExtension)
    const years = data.domainRegistrationYears ?? 1
    const yearsLabel = `${years} ${years === 1 ? 'Year' : 'Years'}`

    drawRow(doc, 'Domain', fullDomain, nextRowY)
    nextRowY += 23

    drawRow(doc, 'Registration period', yearsLabel, nextRowY)
    nextRowY += 23

    drawRow(doc, 'Domain Registration', `BDT ${data.domainAmount}`, nextRowY)
    nextRowY += 23

    const contactNote =
      'The confirmed domain registration contact saved on the vendor account was used for this registration.'
    doc.fillColor('#6B7280').fontSize(9)
    const noteHeight = doc.heightOfString(contactNote, { width: 485 })
    doc.text(contactNote, 60, nextRowY, { width: 485 })

    nextRowY += noteHeight + 10
  }

  const amountBoxY = Math.max(565, nextRowY + 9)

  // Amount box
  doc.roundedRect(50, amountBoxY, 495, 88, 12).fillAndStroke('#F9FAFB', '#E5E7EB')

  doc
    .fillColor('#6B7280')
    .fontSize(10)
    .text('Total Paid', 75, amountBoxY + 25)

  doc
    .fillColor('#111827')
    .fontSize(28)
    .text(`BDT ${data.amount}`, 75, amountBoxY + 45)

  doc
    .fillColor('#6B7280')
    .fontSize(10)
    .text('Payment Status', 365, amountBoxY + 25)

  doc
    .fillColor('#10B981')
    .fontSize(16)
    .text(data.status, 365, amountBoxY + 47)

  const footerY = Math.max(690, amountBoxY + 125)

  // Footer
  doc.fillColor('#6B7280').fontSize(10).text('Thank you for choosing Biponiq.', 50, footerY, {
    width: 495,
    align: 'center',
  })

  doc
    .fillColor('#9CA3AF')
    .fontSize(8)
    .text(
      'This receipt was generated electronically and does not require a signature.',
      50,
      footerY + 30,
      {
        width: 495,
        align: 'center',
      }
    )

  doc.end()

  return pdfBufferPromise
}
