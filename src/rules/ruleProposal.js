import { z } from 'zod'

export const descriptionSchema = z.strictObject({ description: z.string().trim().min(1) })

const proposedRuleSchema = z.strictObject({
  scope: z.enum(['brand', 'platform', 'cart']),
  appliesTo: z.string().nullable(),
  type: z.enum(['percentage', 'flat']),
  value: z.number(),
  stackable: z.boolean(),
  minCartValue: z.number().nullable(),
})

export const proposalSchema = z.strictObject({
  result: z.union([
    z.strictObject({
      kind: z.literal('rule'),
      rule: proposedRuleSchema,
    }),
    z.strictObject({
      kind: z.literal('clarification'),
      message: z.string(),
    }),
  ]),
}).superRefine(({ result }, context) => {
  if (result.kind === 'clarification') {
    if (!result.message.trim()) {
      context.addIssue({ code: 'custom', message: 'Clarification must explain what is missing.' })
    }
    return
  }

  const { scope, appliesTo, type, value, stackable, minCartValue } = result.rule
  if (value <= 0 || (type === 'percentage' && value > 100)) {
    context.addIssue({ code: 'custom', message: 'The discount must be positive and percentages cannot exceed 100.' })
  }
  if (scope === 'cart') {
    if (appliesTo !== null || type !== 'percentage' || stackable || minCartValue === null || minCartValue < 0) {
      context.addIssue({ code: 'custom', message: 'Cart offers require a non-stackable percentage and a minimum cart value.' })
    }
  } else if (!appliesTo?.trim() || minCartValue !== null) {
    context.addIssue({ code: 'custom', message: 'Brand and platform offers require a target.' })
  }
})
