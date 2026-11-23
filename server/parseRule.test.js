import { describe, expect, it, vi } from 'vitest'
import { handleParseRule } from './parseRule.js'

const brandRule = {
  scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true, minCartValue: null,
}
const platformRule = {
  scope: 'platform', appliesTo: 'Flipkart', type: 'flat', value: 100, stackable: false, minCartValue: null,
}
const cartRule = {
  scope: 'cart', appliesTo: null, type: 'percentage', value: 10, stackable: false, minCartValue: 5000,
}
const propose = (rule) => ({ result: { kind: 'rule', rule } })
const modelReply = (proposal) => Response.json({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(proposal) }] } }],
})
const makeRequest = (description) => new Request('http://localhost/api/parse-rule', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ description }),
})
const env = { GEMINI_API_KEY: 'mock-key' }

describe('plain-English rule API with a mocked provider', () => {
  it.each([
    ['20% off for Natura Casa brand, stackable with other offers', brandRule],
    ['Rs.100 flat discount on all Flipkart items', platformRule],
    ['10% off if cart value is more than Rs.5,000', cartRule],
  ])('accepts the structured proposal for %s', async (description, rule) => {
    const fetchImpl = vi.fn().mockResolvedValue(modelReply(propose(rule)))
    const response = await handleParseRule(makeRequest(description), { env, fetchImpl })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(propose(rule))
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, request] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent')
    expect(request.headers['x-goog-api-key']).toBe('mock-key')
    expect(JSON.parse(request.body)).toMatchObject({
      contents: [{ role: 'user', parts: [{ text: description }] }],
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: { type: 'object' } },
    })
  })

  it('returns clarification without proposing a rule for a vague order offer', async () => {
    const clarification = {
      result: { kind: 'clarification', message: 'What discount and minimum cart subtotal should apply?' },
    }
    const fetchImpl = vi.fn().mockResolvedValue(modelReply(clarification))
    const response = await handleParseRule(makeRequest('Give a discount for big orders'), { env, fetchImpl })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(clarification)
  })

  it.each([
    { ...brandRule, value: 120 },
    { ...platformRule, appliesTo: ' ' },
    { ...cartRule, minCartValue: null },
    { ...cartRule, stackable: true },
    { ...cartRule, type: 'flat' },
  ])('rejects unsupported model output %#', async (rule) => {
    const fetchImpl = vi.fn().mockResolvedValue(modelReply(propose(rule)))
    const response = await handleParseRule(makeRequest('Sample offer'), { env, fetchImpl })
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: expect.stringContaining('invalid rule') })
  })

  it('returns a generic error when the provider fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('private provider details'))
    const response = await handleParseRule(makeRequest('Sample offer'), { env, fetchImpl })
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'The rule parser is unavailable right now. Try again.' })
  })

  it('does not call the provider without an API key', async () => {
    const fetchImpl = vi.fn()
    const response = await handleParseRule(makeRequest('Sample offer'), { env: {}, fetchImpl })
    expect(response.status).toBe(503)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns a retryable usage-limit error when Gemini returns 429', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 429 }))
    const response = await handleParseRule(makeRequest('Sample offer'), { env, fetchImpl })
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: expect.stringContaining('usage limit') })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('retries once if Gemini reports temporary unavailability', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(modelReply(propose(brandRule)))
    const response = await handleParseRule(makeRequest('Sample offer'), { env, fetchImpl })
    expect(response.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
