import { useState } from 'react'
import { proposalSchema } from '../rules/ruleProposal.js'

export default function RuleComposer({ onConfirm }) {
  const [description, setDescription] = useState('')
  const [pending, setPending] = useState(false)
  const [proposal, setProposal] = useState(null)
  const [message, setMessage] = useState('')

  async function parseDescription(event) {
    event.preventDefault()
    setPending(true)
    setMessage('')
    try {
      const response = await fetch('/api/parse-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setMessage(typeof payload?.error === 'string' ? payload.error : 'The rule parser is unavailable. Try again.')
        return
      }
      const parsed = proposalSchema.safeParse(payload)
      if (!parsed.success) {
        setMessage('The parser returned an invalid rule. Try rephrasing the offer.')
        return
      }
      const { result } = parsed.data
      if (result.kind === 'clarification') {
        setMessage(result.message)
      } else {
        setProposal(result.rule)
      }
    } catch {
      setMessage('The rule parser is unavailable. Try again.')
    } finally {
      setPending(false)
    }
  }

  function confirmRule() {
    onConfirm(proposal)
    setProposal(null)
    setDescription('')
  }

  return (
    <>
      <form className="rule-composer" onSubmit={parseDescription}>
        <label htmlFor="rule-description">Describe the discount</label>
        <textarea
          id="rule-description"
          rows={3}
          placeholder="20% off for Natura Casa, stackable with other offers"
          value={description}
          disabled={pending || proposal !== null}
          onChange={(event) => {
            setDescription(event.target.value)
            setMessage('')
          }}
        />
        <button type="submit" disabled={!description.trim() || pending || proposal !== null}>
          {pending ? 'Parsing…' : 'Preview rule'}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      {proposal && (
        <div className="rule-preview" role="region" aria-label="Rule preview">
          <dl>
            <dt>Scope</dt><dd>{proposal.scope}</dd>
            {proposal.appliesTo !== null && <><dt>Applies to</dt><dd>{proposal.appliesTo}</dd></>}
            <dt>Type</dt><dd>{proposal.type}</dd>
            <dt>Value</dt>
            <dd>{proposal.type === 'percentage' ? `${proposal.value}%` : `Rs.${proposal.value.toLocaleString('en-IN')}`}</dd>
            <dt>Stackable</dt><dd>{proposal.stackable ? 'Yes' : 'No'}</dd>
            {proposal.minCartValue !== null && (
              <><dt>Minimum cart value</dt><dd>Rs.{proposal.minCartValue.toLocaleString('en-IN')}</dd></>
            )}
          </dl>
          <div className="rule-preview-actions">
            <button type="button" onClick={confirmRule}>Confirm</button>
            <button type="button" onClick={() => setProposal(null)}>Discard</button>
          </div>
        </div>
      )}
    </>
  )
}
