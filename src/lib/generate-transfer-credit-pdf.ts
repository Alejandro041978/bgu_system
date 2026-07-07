import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib'

function sanitize(text: string): string {
  return (text ?? '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/–/g, '-').replace(/—/g, '--').replace(/…/g, '...')
    .replace(/[^\x00-\xFF]/g, (c) => { try { return c.normalize('NFD').replace(/[̀-ͯ]/g, '') } catch { return '?' } })
}

export interface TCRow {
  originCode: string; originTitle: string; originCredit: string; originGrade: string
  bguCode: string; bguTitle: string; bguCredit: string
}

export async function generateTransferCreditPdf(p: {
  studentName: string; studentId: string; date: string; program: string
  originInstitution: string; rows: TCRow[]; totalCredits: number
}): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const reg = await pdf.embedFont(StandardFonts.Helvetica)

  const width = PageSizes.A4[0], height = PageSizes.A4[1], margin = 50
  let page = pdf.addPage(PageSizes.A4)
  let y = height - margin

  const dark = rgb(0.1, 0.12, 0.16), gray = rgb(0.42, 0.45, 0.5), blue = rgb(0.12, 0.25, 0.69)
  const lineC = rgb(0.8, 0.82, 0.85), headBg = rgb(0.93, 0.95, 0.98)

  function text(s: string, x: number, yy: number, size: number, font = reg, color = dark) {
    page.drawText(sanitize(String(s ?? '')), { x, y: yy, size, font, color })
  }
  function wrap(s: string, font: typeof reg, size: number, maxW: number): string[] {
    const out: string[] = []
    for (const para of sanitize(String(s ?? '')).split('\n')) {
      const words = para.split(' '); let cur = ''
      for (const w of words) {
        const test = cur ? `${cur} ${w}` : w
        if (font.widthOfTextAtSize(test, size) > maxW && cur) { out.push(cur); cur = w } else cur = test
      }
      out.push(cur)
    }
    return out.length ? out : ['']
  }

  // Título
  const title = 'Transfer Credit Evaluation Form'
  text(title, (width - bold.widthOfTextAtSize(title, 18)) / 2, y, 18, bold); y -= 36

  // Datos del estudiante
  text('STUDENT INFORMATION', margin, y, 11, bold, blue); y -= 20
  const info: [string, string][] = [
    ['Student Name:', p.studentName], ['Date:', p.date],
    ['Student ID Number:', p.studentId], ['Program:', p.program],
  ]
  for (const [k, v] of info) { text(k, margin, y, 10, bold); text(v, margin + 115, y, 10, reg); y -= 16 }
  y -= 10

  text('TRANSFER CREDIT EVALUATION RESULTS', margin, y, 11, bold, blue); y -= 18
  const para = `Your official transcript from ${p.originInstitution} has been evaluated for transfer credit. You have been granted the following transfer credits:`
  for (const ln of wrap(para, reg, 10, width - 2 * margin)) { text(ln, margin, y, 10, reg, gray); y -= 14 }
  y -= 10

  // Columnas de la tabla
  const c = { oCode: 50, oTitle: 92, oCr: 232, oGrade: 262, bCode: 300, bTitle: 358, bCr: 512 }
  const headH = 26
  function drawHeader() {
    page.drawRectangle({ x: margin, y: y - headH, width: width - 2 * margin, height: headH, color: headBg })
    page.drawLine({ start: { x: c.bCode - 6, y: y }, end: { x: c.bCode - 6, y: y - headH }, thickness: 0.5, color: lineC })
    text('ORIGIN INSTITUTION', c.oCode + 2, y - 10, 7, bold, gray)
    text('BGU', c.bCode + 2, y - 10, 7, bold, gray)
    text('Course #', c.oCode + 2, y - 21, 7, bold); text('Course Title', c.oTitle + 2, y - 21, 7, bold)
    text('Cr.', c.oCr + 2, y - 21, 7, bold); text('Grade', c.oGrade + 2, y - 21, 7, bold)
    text('BGU Course #', c.bCode + 2, y - 21, 7, bold); text('Course Title', c.bTitle + 2, y - 21, 7, bold); text('Cr.', c.bCr + 2, y - 21, 7, bold)
    y -= headH
  }
  drawHeader()

  for (const r of p.rows) {
    const oT = wrap(r.originTitle, reg, 8, c.oCr - c.oTitle - 6)
    const bT = wrap(r.bguTitle, reg, 8, c.bCr - c.bTitle - 6)
    const lines = Math.max(oT.length, bT.length, 1)
    const rowH = lines * 11 + 5
    if (y - rowH < margin + 70) { page = pdf.addPage(PageSizes.A4); y = height - margin; drawHeader() }
    const ty = y - 11
    text(r.originCode, c.oCode + 2, ty, 8)
    oT.forEach((ln, i) => text(ln, c.oTitle + 2, ty - i * 11, 8))
    text(r.originCredit, c.oCr + 2, ty, 8); text(r.originGrade, c.oGrade + 2, ty, 8)
    text(r.bguCode, c.bCode + 2, ty, 8)
    bT.forEach((ln, i) => text(ln, c.bTitle + 2, ty - i * 11, 8))
    text(r.bguCredit, c.bCr + 2, ty, 8)
    y -= rowH
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: lineC })
  }

  y -= 8
  text('Total:', c.bTitle + 2, y, 10, bold)
  text(String(p.totalCredits), c.bCr + 2, y, 10, bold)
  y -= 30

  const foot = "If you have any questions regarding the University's transfer credit policies, or the credits you have received, please refer to the institutional catalog or contact the University Registrar."
  for (const ln of wrap(foot, reg, 9, width - 2 * margin)) { text(ln, margin, y, 9, reg, gray); y -= 13 }
  y -= 34
  text('University Registrar', margin, y, 10, bold)

  const bytes = await pdf.save()
  return Buffer.from(bytes)
}
