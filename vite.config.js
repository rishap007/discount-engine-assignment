import { Readable } from 'node:stream'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handleParseRule } from './server/parseRule.js'

export default defineConfig(({ mode }) => ({
  optimizeDeps: { include: ['pdfjs-dist'] },
  plugins: [react(), {
    name: 'local-rule-parser',
    configureServer(server) {
      const env = {
        ...loadEnv(mode, process.cwd(), ['GEMINI_', 'RULE_PARSE_']),
        ...process.env,
      }
      server.middlewares.use('/api/parse-rule', async (incoming, outgoing, next) => {
        try {
          const method = incoming.method
          const hasBody = method !== 'GET' && method !== 'HEAD'
          const request = new Request('http://localhost/api/parse-rule', {
            method,
            headers: incoming.headers,
            body: hasBody ? Readable.toWeb(incoming) : undefined,
            duplex: 'half',
          })
          const response = await handleParseRule(request, { env })
          outgoing.writeHead(response.status, Object.fromEntries(response.headers))
          outgoing.end(await response.text())
        } catch (cause) {
          next(cause)
        }
      })
    },
  }],
}))
