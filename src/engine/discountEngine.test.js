import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCartCSV, parseRulesCSV } from './csvParser.js'
import { priceCart } from './discountEngine.js'

const sample = (file) => readFileSync(new URL(`../../sample-data/${file}`, import.meta.url), 'utf8')
const cartRule = {
  ruleId: 'RULE-04', scope: 'cart', type: 'percentage', value: 10, stackable: false, minCartValue: 4000,
}
const item = { itemId: 'ITEM-01', product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India' }

describe('cart offers', () => {
  it('prices the bundled sample end to end', () => {
    const cart = parseCartCSV(sample('cart.csv'))
    const rules = parseRulesCSV(sample('rules.csv'))
    expect(cart.errors).toEqual([])
    expect(rules.errors).toEqual([])

    const result = priceCart(cart.data, rules.data)
    expect(result.items.map(({ finalPrice }) => finalPrice)).toEqual([1104, 629, 509, 2499, 382, 809])
    expect(result.subtotal).toBe(5932)
    expect(result.cartOffer).toEqual({ ruleId: 'RULE-04', percentage: 10, savings: 593 })
    expect(result.finalTotal).toBe(5339)
  })

  it('applies the offer at the threshold', () => {
    const result = priceCart([{ ...item, basePrice: 4000 }], [cartRule])
    expect(result.cartOffer?.savings).toBe(400)
    expect(result.finalTotal).toBe(3600)
  })

  it('checks eligibility against the discounted subtotal', () => {
    const itemRule = { ruleId: 'BRAND', scope: 'brand', appliesTo: item.brand, type: 'flat', value: 1, stackable: false }
    const result = priceCart([{ ...item, basePrice: 4000 }], [itemRule, cartRule])
    expect(result.subtotal).toBe(3999)
    expect(result.cartOffer).toBeNull()
    expect(result.finalTotal).toBe(3999)
  })

  it('selects the largest eligible cart saving', () => {
    const betterRule = { ...cartRule, ruleId: 'BETTER', value: 20 }
    const ineligibleRule = { ...cartRule, ruleId: 'INELIGIBLE', value: 30, minCartValue: 4001 }
    const result = priceCart([{ ...item, basePrice: 4000 }], [cartRule, ineligibleRule, betterRule])
    expect(result.cartOffer?.ruleId).toBe('BETTER')
    expect(result.finalTotal).toBe(3200)
  })

  it('reports a missing cart threshold and retains valid item rules', () => {
    const rules = parseRulesCSV(sample('rules.csv').replace('false,4000', 'false,'))
    expect(rules.data).toHaveLength(3)
    expect(rules.errors).toEqual([expect.stringContaining('min_cart_value')])
  })

  it('still accepts item rules from a CSV without the threshold column', () => {
    const csv = 'rule_id,scope,applies_to,type,value,stackable\nRULE-01,platform,Amazon India,percentage,15,false'
    const rules = parseRulesCSV(csv)
    expect(rules.errors).toEqual([])
    const result = priceCart([{ ...item, basePrice: 1299 }], rules.data)
    expect(result.cartOffer).toBeNull()
    expect(result.finalTotal).toBe(1104)
  })

  it('caps a stackable flat discount at the remaining item price', () => {
    const rules = [
      { ruleId: 'BRAND', scope: 'brand', appliesTo: item.brand, type: 'flat', value: 25, stackable: false },
      { ruleId: 'PLATFORM', scope: 'platform', appliesTo: item.platform, type: 'flat', value: 100, stackable: true },
    ]
    const { items, finalTotal } = priceCart([{ ...item, basePrice: 75 }], rules)
    expect(finalTotal).toBe(0)
    expect(items[0].totalDiscount).toBe(75)
    expect(items[0].reasoning).toContain('Rs.100 off (Rs.50 applied)')
  })
})
