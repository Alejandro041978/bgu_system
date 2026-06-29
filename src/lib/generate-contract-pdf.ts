import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib'

// Normaliza caracteres Unicode que WinAnsi no puede codificar
function sanitize(text: string): string {
  return text
    .replace(/ﬀ/g, 'ff').replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl')
    .replace(/ﬃ/g, 'ffi').replace(/ﬄ/g, 'ffl')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/–/g, '-').replace(/—/g, '--')
    .replace(/…/g, '...').replace(/ /g, ' ')
    .replace(/[^\x00-\xFF]/g, (c) => {
      // Intentar equivalente latin-1, si no reemplazar con '?'
      try { return c.normalize('NFD').replace(/[̀-ͯ]/g, '') } catch { return '?' }
    })
}

export async function generateContractPdf(params: {
  signerName: string
  signerEmail: string
  templateName: string
  body: string
  signedAt: Date
  ipAddress: string
}): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)

  // Sanitize all text inputs
  const templateName = sanitize(params.templateName)
  const body = sanitize(params.body)
  const signerName = sanitize(params.signerName)
  const signerEmail = sanitize(params.signerEmail)
  const ipAddress = sanitize(params.ipAddress)

  const blue = rgb(0.118, 0.251, 0.686)   // #1e40af
  const green = rgb(0.086, 0.639, 0.243)  // #16a34a
  const dark = rgb(0.067, 0.094, 0.153)   // #111827
  const gray = rgb(0.42, 0.447, 0.502)    // #6b7280
  const lightGray = rgb(0.961, 0.961, 0.969)
  const lightGreen = rgb(0.94, 0.992, 0.953)
  const white = rgb(1, 1, 1)

  const margin = 50
  const pageWidth = PageSizes.A4[0]
  const pageHeight = PageSizes.A4[1]
  const contentWidth = pageWidth - margin * 2

  // Helper: wrap text into lines fitting maxWidth
  function wrapText(text: string, font: typeof helvetica, size: number, maxWidth: number): string[] {
    const lines: string[] = []
    for (const paragraph of text.split('\n')) {
      if (paragraph.trim() === '') { lines.push(''); continue }
      const words = paragraph.split(' ')
      let current = ''
      for (const word of words) {
        const test = current ? `${current} ${word}` : word
        if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
          lines.push(current)
          current = word
        } else {
          current = test
        }
      }
      if (current) lines.push(current)
    }
    return lines
  }

  // --- Build pages ---
  const bodyLines = wrapText(body, helvetica, 10, contentWidth)
  const signedAtStr = params.signedAt.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  // Evidence block height
  const evidenceHeight = 110

  // We'll paginate body lines
  const lineHeight = 14
  const headerHeight = 72
  // First page: header + body
  // Last page: body + evidence block at bottom
  // Reserve space for evidence only on last page
  const firstPageBodySpace = pageHeight - headerHeight - margin - evidenceHeight - 20
  const otherPageBodySpace = pageHeight - margin * 2 - evidenceHeight - 20
  const linesPerFirstPage = Math.floor(firstPageBodySpace / lineHeight)
  const linesPerOtherPage = Math.floor(otherPageBodySpace / lineHeight)

  // Split lines into pages
  const pages: string[][] = []
  let remaining = [...bodyLines]
  pages.push(remaining.splice(0, linesPerFirstPage))
  while (remaining.length > 0) {
    pages.push(remaining.splice(0, linesPerOtherPage))
  }
  if (pages.length === 0) pages.push([])

  for (let p = 0; p < pages.length; p++) {
    const page = pdfDoc.addPage(PageSizes.A4)
    let y = pageHeight

    // Header on first page
    if (p === 0) {
      page.drawRectangle({ x: 0, y: pageHeight - headerHeight, width: pageWidth, height: headerHeight, color: blue })
      page.drawText(templateName, {
        x: margin, y: pageHeight - 38,
        font: helveticaBold, size: 16, color: white,
        maxWidth: contentWidth,
      })
      page.drawText('Documento firmado digitalmente', {
        x: margin, y: pageHeight - 58,
        font: helvetica, size: 9, color: rgb(0.75, 0.855, 0.988),
      })
      y = pageHeight - headerHeight - 24
    } else {
      // Page number header
      page.drawText(`${templateName}  ·  Página ${p + 1}`, {
        x: margin, y: pageHeight - 28,
        font: helvetica, size: 8, color: gray,
      })
      y = pageHeight - margin - 10
    }

    // Body lines
    for (const line of pages[p]) {
      if (line === '') { y -= lineHeight * 0.5; continue }
      page.drawText(line, { x: margin, y, font: helvetica, size: 10, color: dark })
      y -= lineHeight
    }

    // Evidence block on last page
    if (p === pages.length - 1) {
      const blockY = margin
      const blockH = evidenceHeight

      // Separator line
      page.drawLine({
        start: { x: margin, y: blockY + blockH + 12 },
        end: { x: pageWidth - margin, y: blockY + blockH + 12 },
        thickness: 0.5, color: rgb(0.9, 0.9, 0.9),
      })

      // Green background
      page.drawRectangle({ x: margin, y: blockY, width: contentWidth, height: blockH, color: lightGreen })
      page.drawRectangle({ x: margin, y: blockY, width: contentWidth, height: blockH, borderColor: green, borderWidth: 1 })

      // Title
      page.drawText('EVIDENCIA DE FIRMA DIGITAL', {
        x: margin + 12, y: blockY + blockH - 20,
        font: helveticaBold, size: 7.5, color: green,
      })

      // Fields — 2 columns
      const col1x = margin + 12
      const col2x = margin + contentWidth / 2

      const fields: [string, string][] = [
        ['Firmante:', signerName],
        ['Correo:', signerEmail],
        ['Fecha y hora:', `${signedAtStr} (Lima, PE)`],
        ['IP registrada:', ipAddress || '—'],
        ['Verificación:', 'OTP por correo electrónico'],
      ]

      const fieldRows = [
        [fields[0], fields[3]],
        [fields[1], fields[4]],
        [fields[2], null],
      ]

      let fy = blockY + blockH - 36
      for (const row of fieldRows) {
        const [left, right] = row
        if (left) {
          page.drawText(left[0], { x: col1x, y: fy, font: helveticaBold, size: 8, color: gray })
          page.drawText(left[1], { x: col1x + 60, y: fy, font: helvetica, size: 8, color: dark, maxWidth: contentWidth / 2 - 70 })
        }
        if (right) {
          page.drawText(right[0], { x: col2x, y: fy, font: helveticaBold, size: 8, color: gray })
          page.drawText(right[1], { x: col2x + 80, y: fy, font: helvetica, size: 8, color: dark, maxWidth: contentWidth / 2 - 90 })
        }
        fy -= 16
      }

      // Footer note
      page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: margin - 8, color: lightGray })
      page.drawText('Este documento tiene validez legal como evidencia de firma electrónica simple.', {
        x: margin, y: 14, font: helvetica, size: 7, color: gray,
      })
    }
  }

  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}
