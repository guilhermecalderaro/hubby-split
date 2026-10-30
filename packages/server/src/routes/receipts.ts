import { Router } from 'express'
import multer from 'multer'
import {
  fetchNfce, ManualLookupRequired, nfcePortalUrl, nfePortalUrl, normalizeAccessKey, parseReceiptFile, receiptModel,
} from '../services/receipts'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

router.get('/:key', async (req, res) => {
  const key = normalizeAccessKey(req.params.key)
  if (!key) return res.status(400).json({ error: 'Chave de acesso deve ter 44 dígitos.' })

  if (receiptModel(key) !== '65') {
    return res.status(422).json({
      error: 'NF-e não pode ser consultada automaticamente (exige login gov.br). Abra no portal, salve a página (Ctrl+S) e envie aqui.',
      needsFile: true,
      portalUrl: nfePortalUrl(key),
    })
  }

  try {
    res.json(await fetchNfce(key))
  } catch (err: any) {
    if (err instanceof ManualLookupRequired) {
      return res.status(422).json({ error: err.message, needsFile: true, portalUrl: nfcePortalUrl(key) })
    }
    res.status(502).json({ error: err.message })
  }
})

router.post('/file', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' })
  try {
    const receipt = parseReceiptFile(req.file.buffer)
    const expected = req.body.accessKey ? normalizeAccessKey(req.body.accessKey) : null
    if (expected && expected !== receipt.accessKey) {
      return res.status(400).json({ error: 'O arquivo enviado é de outra nota (chave de acesso diferente).' })
    }
    res.json(receipt)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

export default router
