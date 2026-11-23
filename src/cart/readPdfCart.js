import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { extractPdfCart } from './pdfCartParser.js'

GlobalWorkerOptions.workerSrc = workerUrl

export async function readPdfCart(file) {
  const loadingTask = getDocument({ data: await file.arrayBuffer(), stopAtErrors: true })
  try {
    const document = await loadingTask.promise.catch((error) => {
      if (error.name === 'PasswordException') throw new Error('This cart PDF is password-protected.')
      throw new Error('Could not open the cart PDF. Choose a readable, text-based PDF.')
    })
    return await extractPdfCart(document)
  } finally {
    await loadingTask.destroy()
  }
}
