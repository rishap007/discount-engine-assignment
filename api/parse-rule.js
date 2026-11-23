import { handleParseRule } from '../server/parseRule.js'

export default {
  fetch(request) {
    return handleParseRule(request)
  },
}
