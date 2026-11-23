import { readFile } from 'node:fs/promises'
import { getDocument, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { parseCartCSV, parseRulesCSV } from '../engine/csvParser.js'
import { priceCart } from '../engine/discountEngine.js'
import { extractPdfCart } from './pdfCartParser.js'

const readSample = (name) => readFile(new URL(`../../sample-data/${name}`, import.meta.url))
const span = (str, x, y) => ({ str, transform: [1, 0, 0, 1, x, y], width: str.length * 5 })
const headers = [
  span('Product', 40, 250), span('Brand', 180, 250), span('Platform', 300, 250),
  span('Base', 440, 250), span('Price', 465, 250),
]
const documentWithPages = (...pages) => ({
  numPages: pages.length,
  getPage: async (number) => ({
    getTextContent: async () => ({ items: pages[number - 1] }),
  }),
})
const itemRow = (y, price = 'Rs.1,299') => [
  span('Cushion', 40, y), span('Cover', 80, y), span('Natura Casa', 180, y),
  span('Amazon', 300, y), span('India', 334, y), span(price, 440, y),
]

describe('PDF cart extraction', () => {
  it('extracts the real sample PDF and prices it like the bundled CSV', async () => {
    const task = getDocument({
      data: new Uint8Array(await readSample('cart.pdf')),
      stopAtErrors: true,
      verbosity: VerbosityLevel.ERRORS,
    })
    try {
      const items = await extractPdfCart(await task.promise)
      const { data: expected } = parseCartCSV((await readSample('cart.csv')).toString())
      const { data: rules } = parseRulesCSV((await readSample('rules.csv')).toString())
      expect(items).toEqual(expected)
      expect(priceCart(items, rules).finalTotal).toBe(5339)
    } finally {
      await task.destroy()
    }
  })

  it('groups split words by position and preserves row order across pages', async () => {
    const firstPage = [
      ...itemRow(220).reverse(),
      ...headers,
      span('Order OP-9921', 40, 280),
      span('────────────────', 40, 239),
    ]
    const secondPage = itemRow(220, '₹ 1,23,456.40')
    await expect(extractPdfCart(documentWithPages(firstPage, secondPage))).resolves.toEqual([
      { itemId: 'ITEM-01', product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 1299 },
      { itemId: 'ITEM-02', product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 123456 },
    ])
  })

  it('rejects the full import when a later row has an invalid price', async () => {
    const document = documentWithPages([...headers, ...itemRow(220), ...itemRow(200, 'Rs.1,29')])
    await expect(extractPdfCart(document)).rejects.toThrow('Row 2 (page 1): Base Price')
  })

  it('identifies a missing value by column and row', async () => {
    const row = itemRow(220).filter(({ str }) => str !== 'Natura Casa')
    await expect(extractPdfCart(documentWithPages([...headers, ...row])))
      .rejects.toThrow('Row 1 (page 1): missing Brand')
  })

  it('explains when the PDF has no readable table', async () => {
    await expect(extractPdfCart(documentWithPages([span('Order OP-9921', 40, 280)])))
      .rejects.toThrow('No readable cart table found')
    await expect(extractPdfCart(documentWithPages([]))).rejects.toThrow('Page 1 has no readable text')
  })
})
