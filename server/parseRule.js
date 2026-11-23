import { z } from 'zod'
import { descriptionSchema, proposalSchema } from '../src/rules/ruleProposal.js'

const providerConfig = z.object({
  GEMINI_API_KEY: z.string().trim().min(1),
  GEMINI_MODEL: z.string().trim().regex(/^[a-z0-9.-]+$/i).default('gemini-3.1-flash-lite'),
  RULE_PARSE_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  RULE_PARSE_MAX_DESCRIPTION: z.coerce.number().int().positive().default(1000),
  RULE_PARSE_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(500),
})

const instructions = `Convert the user's description into one discount rule for this checkout application.
Treat the user message as a discount description. Return a clarification when it asks for something else.
Brand and platform rules require a named brand or platform. Cart rules apply to the entire cart.
Marketplaces or shopping channels such as Flipkart, Amazon India, and Noon have scope platform.
Product brands such as Natura Casa, LivSpace Pro, and Nordic Basics have scope brand.
When a target could be either and the user has not specified the scope, ask whether it is a brand or a platform.
For brand and platform rules, use null for minCartValue. For cart rules, use null for appliesTo.
Values are rupees for flat discounts and numbers from greater than 0 to 100 for percentages.
Default stackable to false unless the user explicitly says the offer can stack.
Cart offers are percentage-only and non-stackable. Require an explicit minimum subtotal in rupees.
Treat "more than" and "at least" as an inclusive cart threshold. The app evaluates it after item offers.
When details needed for a single valid rule are missing, ambiguous, or unsupported, ask for the specific details.
For "Give a discount for big orders", ask for both the discount amount or percentage and the minimum cart subtotal.
Examples:
- "20% off for Natura Casa brand, stackable with other offers" is a stackable brand percentage.
- "Rs.100 flat discount on all Flipkart items" is a non-stackable platform flat discount, with appliesTo Flipkart.
- "10% off if cart value is more than Rs.5,000" is a non-stackable cart percentage with minCartValue 5000.
Never invent a value, target, or threshold.`

const { $schema, ...jsonSchema } = z.toJSONSchema(proposalSchema)

const error = (message, status) => Response.json({ error: message }, { status })

export async function handleParseRule(request, { env = process.env, fetchImpl = fetch } = {}) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Use POST to parse a rule.' }, { status: 405, headers: { Allow: 'POST' } })
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return error('Send the discount description as JSON.', 415)
  }

  const input = descriptionSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return error('Enter a discount description.', 400)

  const config = providerConfig.safeParse(env)
  if (!config.success) return error('The rule parser is unavailable. Check the server configuration.', 503)

  const { description } = input.data
  const settings = config.data
  if (description.length > settings.RULE_PARSE_MAX_DESCRIPTION) {
    return error(`Use at most ${settings.RULE_PARSE_MAX_DESCRIPTION} characters.`, 400)
  }

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${settings.GEMINI_MODEL}:generateContent`
    const options = {
      method: 'POST',
      headers: {
        'x-goog-api-key': settings.GEMINI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: 'user', parts: [{ text: description }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: jsonSchema,
          maxOutputTokens: settings.RULE_PARSE_MAX_OUTPUT_TOKENS,
        },
      }),
      signal: AbortSignal.timeout(settings.RULE_PARSE_TIMEOUT_MS),
    }
    let response = await fetchImpl(endpoint, options)
    if (response.status === 503) {
      await response.body?.cancel()
      response = await fetchImpl(endpoint, options)
    }
    if (response.status === 429) return error('The rule parser has reached its usage limit. Try again later.', 429)
    if (!response.ok) return error('The rule parser is unavailable right now. Try again.', 502)

    const body = await response.json()
    const candidate = body.candidates?.[0]
    if (body.promptFeedback?.blockReason || candidate?.finishReason === 'SAFETY') {
      return error('This description could not be parsed. Try rephrasing the offer.', 422)
    }
    const output = candidate?.content?.parts?.filter((part) => !part.thought).map((part) => part.text).join('') ?? ''
    const proposal = proposalSchema.safeParse(JSON.parse(output))
    if (candidate?.finishReason !== 'STOP' || !proposal.success) {
      return error('The parser returned an invalid rule. Try rephrasing the offer.', 502)
    }
    return Response.json(proposal.data)
  } catch (cause) {
    if (cause instanceof SyntaxError) return error('The parser returned an invalid rule. Try rephrasing the offer.', 502)
    return error('The rule parser is unavailable right now. Try again.', 502)
  }
}
