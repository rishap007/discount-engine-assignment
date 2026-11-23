const HEADERS = ['Product', 'Brand', 'Platform', 'Base Price']
const ROW_TOLERANCE = 2

function textLines(items) {
  const spans = items.filter(({ str }) => str?.trim()).map(({ str, transform, width }) => ({
    text: str,
    x: transform[4],
    y: transform[5],
    width,
  })).sort((a, b) => b.y - a.y)

  const lines = []
  for (const span of spans) {
    const line = lines.at(-1)
    if (line && Math.abs(line.y - span.y) <= ROW_TOLERANCE) {
      line.spans.push(span)
    } else {
      lines.push({ y: span.y, spans: [span] })
    }
  }
  return lines.map(({ spans }) => spans.sort((a, b) => a.x - b.x))
}

function headerColumns(line) {
  const words = line.flatMap(({ text, x, width }) =>
    Array.from(text.matchAll(/\S+/g), (word) => ({
      text: word[0].toLowerCase(),
      x: x + width * word.index / text.length,
    })),
  )
  if (words.map(({ text }) => text).join(' ') !== 'product brand platform base price') return null
  return words.slice(0, HEADERS.length).map(({ x }) => x)
}

function parseBasePrice(text) {
  const amount = text.replace(/^(?:rs\.?|inr|₹)\s*/i, '')
  const validAmount = /^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/
  if (!validAmount.test(amount)) return null
  const rounded = Math.round(Number(amount.replaceAll(',', '')))
  return Number.isSafeInteger(rounded) && rounded > 0 ? rounded : null
}

function parseRow(line, columns, rowNumber, pageNumber) {
  const cells = HEADERS.map(() => [])
  for (const span of line) {
    const column = Math.max(0, columns.findLastIndex((x) => span.x >= x - ROW_TOLERANCE))
    cells[column].push(span.text.trim())
  }

  const values = cells.map((pieces) => pieces.join(' ').replace(/\s+/g, ' '))
  const missing = HEADERS.filter((_, index) => !values[index])
  const location = `Row ${rowNumber} (page ${pageNumber})`
  if (missing.length) throw new Error(`${location}: missing ${missing.join(', ')}.`)

  const [product, brand, platform, price] = values
  const basePrice = parseBasePrice(price)
  if (basePrice === null) throw new Error(`${location}: Base Price must be a positive rupee amount.`)

  return { itemId: `ITEM-${String(rowNumber).padStart(2, '0')}`, product, brand, platform, basePrice }
}

export async function extractPdfCart(document) {
  const cart = []
  let columns = null

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber)
    const { items } = await page.getTextContent()
    const lines = textLines(items)
    if (lines.length === 0) {
      throw new Error(`Page ${pageNumber} has no readable text. Use a text-based cart PDF.`)
    }

    const pageHeaders = lines.map(headerColumns)
    const header = pageHeaders.findIndex(Boolean)
    if (header >= 0) columns = pageHeaders[header]
    if (!columns) continue

    for (const line of lines.slice(header + 1)) {
      const text = line.map((span) => span.text).join('').trim()
      if (/^[-─–—_]+$/.test(text)) continue
      cart.push(parseRow(line, columns, cart.length + 1, pageNumber))
    }
  }

  if (!columns || !cart.length) {
    throw new Error('No readable cart table found. Include Product, Brand, Platform, and Base Price columns with at least one item.')
  }
  return cart
}
