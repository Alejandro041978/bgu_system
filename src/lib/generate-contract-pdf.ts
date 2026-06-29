import PDFDocument from 'pdfkit'

export async function generateContractPdf(params: {
  signerName: string
  signerEmail: string
  templateName: string
  body: string
  signedAt: Date
  ipAddress: string
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 72, size: 'A4' })
    const chunks: Buffer[] = []

    doc.on('data', chunk => chunks.push(chunk as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const blue = '#1e40af'
    const gray = '#6b7280'
    const dark = '#111827'

    // Header
    doc.rect(0, 0, doc.page.width, 80).fill(blue)
    doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold')
      .text(params.templateName, 72, 28, { width: doc.page.width - 144 })
    doc.fillColor('#bfdbfe').fontSize(10).font('Helvetica')
      .text('Documento firmado digitalmente', 72, 52)

    doc.moveDown(3)

    // Body text
    doc.fillColor(dark).fontSize(10).font('Helvetica')
      .text(params.body, {
        align: 'justify',
        lineGap: 4,
      })

    // Signature block
    const pageBottom = doc.page.height - 72
    const blockTop = pageBottom - 130

    doc.moveTo(72, blockTop).lineTo(doc.page.width - 72, blockTop)
      .strokeColor('#e5e7eb').lineWidth(1).stroke()

    doc.rect(72, blockTop + 16, doc.page.width - 144, 114)
      .fillColor('#f0fdf4').fill()
    doc.rect(72, blockTop + 16, doc.page.width - 144, 114)
      .strokeColor('#86efac').lineWidth(1).stroke()

    doc.fillColor('#16a34a').fontSize(8).font('Helvetica-Bold')
      .text('EVIDENCIA DE FIRMA DIGITAL', 88, blockTop + 28, { characterSpacing: 1 })

    const col1 = 88
    const col2 = 320
    const row1 = blockTop + 44
    const row2 = blockTop + 66
    const row3 = blockTop + 88

    doc.fillColor(gray).fontSize(8).font('Helvetica')
    doc.text('Firmante:', col1, row1)
    doc.text('Correo electrónico:', col1, row2)
    doc.text('Fecha y hora:', col1, row3)
    doc.text('IP registrada:', col2, row1)
    doc.text('Método de verificación:', col2, row2)

    doc.fillColor(dark).font('Helvetica-Bold')
    doc.text(params.signerName, col1 + 55, row1)
    doc.text(params.signerEmail, col1 + 110, row2)
    doc.text(
      params.signedAt.toLocaleString('es-PE', {
        timeZone: 'America/Lima',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }) + ' (Lima, PE)',
      col1 + 65, row3
    )
    doc.text(params.ipAddress || '—', col2 + 75, row1)
    doc.text('OTP por correo electrónico', col2 + 135, row2)

    doc.end()
  })
}
