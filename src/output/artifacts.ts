import { strToU8, zipSync } from 'fflate'

export type ArtifactKind = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'html' | 'md' | 'txt' | 'json' | 'csv'

const XML = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const HTML = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const safeBase = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 56) || 'autowork-delivery'

export function inferArtifactKind(format = ''): ArtifactKind {
  const value = format.toLowerCase()
  if (/powerpoint|pptx|slide deck|slides/.test(value)) return 'pptx'
  if (/spreadsheet|excel|xlsx/.test(value)) return 'xlsx'
  if (/word|docx/.test(value)) return 'docx'
  if (/\bpdf\b/.test(value)) return 'pdf'
  if (/\bhtml?\b|web page/.test(value)) return 'html'
  if (/\bjson\b/.test(value)) return 'json'
  if (/\bcsv\b/.test(value)) return 'csv'
  if (/plain text|\btxt\b/.test(value)) return 'txt'
  return 'md'
}

export const artifactExtension = (format: string) => inferArtifactKind(format)

function stripMarkdown(value: string) {
  return value
    .replace(/```[a-z0-9_-]*\n([\s\S]*?)```/gi, '$1')
    .replace(/^#{1,6}\s+/gm, '').replace(/^>\s?/gm, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/[*_~`]/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

function markdownRows(value: string): string[][] {
  const lines = value.split(/\r?\n/)
  const start = lines.findIndex((line, index) => line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? ''))
  if (start < 0) return value.split(/\r?\n/).filter(Boolean).map((line) => [stripMarkdown(line)])
  return lines.slice(start).filter((line) => line.includes('|') && !/^\s*\|?\s*:?-{3,}/.test(line)).map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => stripMarkdown(cell.trim())))
}

function markdownHtml(value: string, title: string) {
  const inline = (line: string) => HTML(line)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>')
  const blocks: string[] = []
  let inList = false
  for (const raw of value.split(/\r?\n/)) {
    const line = raw.trim()
    const bullet = /^[-*]\s+(.+)/.exec(line)
    if (bullet) { if (!inList) blocks.push('<ul>'); inList = true; blocks.push(`<li>${inline(bullet[1])}</li>`); continue }
    if (inList) { blocks.push('</ul>'); inList = false }
    const heading = /^(#{1,6})\s+(.+)/.exec(line)
    if (heading) blocks.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`)
    else if (line) blocks.push(`<p>${inline(line)}</p>`)
  }
  if (inList) blocks.push('</ul>')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${HTML(title)}</title><style>body{font:16px/1.65 Inter,system-ui,sans-serif;color:#17202a;max-width:900px;margin:48px auto;padding:0 28px}h1,h2,h3{line-height:1.2;color:#0c2732;margin-top:1.6em}h1{font-size:2.25rem;border-bottom:2px solid #dce8e9;padding-bottom:.35em}a{color:#087f8c}code{background:#edf3f3;padding:.15em .35em;border-radius:6px}li{margin:.35em 0}@media print{body{margin:0;max-width:none}}</style></head><body>${blocks.join('\n')}</body></html>`
}

async function makeDocx(content: string) {
  const { Packer, Document, Paragraph, HeadingLevel, TextRun } = await import('docx')
  const children = content.split(/\r?\n/).map((raw) => {
    const heading = /^(#{1,3})\s+(.+)/.exec(raw.trim())
    const bullet = /^[-*]\s+(.+)/.exec(raw.trim())
    if (heading) return new Paragraph({ text: stripMarkdown(heading[2]), heading: [HeadingLevel.TITLE, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2][heading[1].length - 1] })
    if (bullet) return new Paragraph({ children: [new TextRun(stripMarkdown(bullet[1]))], bullet: { level: 0 }, spacing: { after: 100 } })
    return new Paragraph({ children: [new TextRun(stripMarkdown(raw))], spacing: { after: raw.trim() ? 160 : 80, line: 300 } })
  })
  return Packer.toBlob(new Document({ sections: [{ properties: {}, children }] }))
}

async function makePdf(content: string, title: string) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 52; const width = 595 - margin * 2; let y = 60
  pdf.setTextColor(20, 38, 46); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18)
  for (const line of pdf.splitTextToSize(title, width)) { pdf.text(line, margin, y); y += 23 }
  y += 10; pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10.5); pdf.setTextColor(38, 51, 58)
  for (const paragraph of stripMarkdown(content).split(/\n/)) {
    if (!paragraph.trim()) { y += 8; continue }
    const lines = pdf.splitTextToSize(paragraph, width)
    for (const line of lines) { if (y > 790) { pdf.addPage(); y = 52 }; pdf.text(line, margin, y); y += 15 }
    y += 4
  }
  return pdf.output('blob')
}

const zipBlob = (entries: Record<string, string>, mime: string) => new Blob([zipSync(Object.fromEntries(Object.entries(entries).map(([name, value]) => [name, strToU8(value)]))) as BlobPart], { type: mime })

function makeXlsx(content: string) {
  const rows = markdownRows(content).slice(0, 5000)
  const cells = rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => `<c r="${String.fromCharCode(65 + (c % 26))}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${XML(value)}</t></is></c>`).join('')}</row>`).join('')
  return zipBlob({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Autowork output" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cells}</sheetData></worksheet>`,
  }, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}

function makePptx(content: string) {
  const sections = content.split(/(?=^#{1,2}\s+)/m).filter((part) => part.trim()).slice(0, 20)
  const slides = sections.length ? sections : [content]
  const entries: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>`,
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>',
    'ppt/presentation.xml': `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>`,
    'ppt/slideMasters/slideMaster1.xml': '<?xml version="1.0"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>',
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>',
    'ppt/slideLayouts/slideLayout1.xml': '<?xml version="1.0"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld></p:sldLayout>',
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>',
    'ppt/theme/theme1.xml': '<?xml version="1.0"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Autowork"><a:themeElements><a:clrScheme name="Autowork"><a:dk1><a:srgbClr val="15333D"/></a:dk1><a:lt1><a:srgbClr val="F7FAF9"/></a:lt1><a:accent1><a:srgbClr val="16A3A5"/></a:accent1><a:accent2><a:srgbClr val="7768AE"/></a:accent2><a:accent3><a:srgbClr val="DB8B56"/></a:accent3><a:accent4><a:srgbClr val="5E8C6A"/></a:accent4><a:accent5><a:srgbClr val="477998"/></a:accent5><a:accent6><a:srgbClr val="AA4465"/></a:accent6><a:hlink><a:srgbClr val="087F8C"/></a:hlink><a:folHlink><a:srgbClr val="6C5A8E"/></a:folHlink></a:clrScheme><a:fontScheme name="Autowork"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme><a:fmtScheme name="Autowork"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements></a:theme>',
  }
  slides.forEach((section, index) => {
    const lines = section.trim().split(/\r?\n/).filter(Boolean)
    const title = stripMarkdown(lines.shift() ?? `Slide ${index + 1}`).slice(0, 120)
    const body = stripMarkdown(lines.join('\n')).slice(0, 1800)
    entries[`ppt/slides/slide${index + 1}.xml`] = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="F7FAF9"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="650000" y="500000"/><a:ext cx="10800000" cy="900000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800" b="1"><a:solidFill><a:srgbClr val="15333D"/></a:solidFill></a:rPr><a:t>${XML(title)}</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="700000" y="1550000"/><a:ext cx="10600000" cy="4500000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1500"><a:solidFill><a:srgbClr val="294750"/></a:solidFill></a:rPr><a:t>${XML(body)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
    entries[`ppt/slides/_rels/slide${index + 1}.xml.rels`] = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>'
  })
  return zipBlob(entries, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
}

export async function buildOutputFile(content: string, format: string, title = 'Autowork delivery'): Promise<File> {
  const kind = inferArtifactKind(format)
  let blob: Blob
  if (kind === 'docx') blob = await makeDocx(content)
  else if (kind === 'pdf') blob = await makePdf(content, title)
  else if (kind === 'xlsx') blob = makeXlsx(content)
  else if (kind === 'pptx') blob = makePptx(content)
  else if (kind === 'html') blob = new Blob([markdownHtml(content, title)], { type: 'text/html' })
  else if (kind === 'json') { let value: unknown; try { value = JSON.parse(content) } catch { value = { title, output: content } }; blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }) }
  else if (kind === 'csv') blob = new Blob([markdownRows(content).map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\r\n')], { type: 'text/csv' })
  else if (kind === 'txt') blob = new Blob([stripMarkdown(content)], { type: 'text/plain' })
  else blob = new Blob([content], { type: 'text/markdown' })
  return new File([blob], `${safeBase(title)}.${kind}`, { type: blob.type, lastModified: Date.now() })
}

export async function downloadOutput(content: string, format: string, title?: string) {
  const file = await buildOutputFile(content, format, title)
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
