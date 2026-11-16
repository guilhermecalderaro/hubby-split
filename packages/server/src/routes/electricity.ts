import { Router } from 'express'
import multer from 'multer'
import { parseRgeBill } from '../services/parsers/rgeBill'
import { deleteElectricityBill, queryElectricityBills, upsertElectricityBill } from '../services/db'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 120, fileSize: 10 * 1024 * 1024 } })

// Upload one or more RGE bill PDFs; each is parsed and upserted by reference month
router.post('/bills', upload.array('files'), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? []
  if (!files.length) return res.status(400).json({ error: 'Nenhum arquivo enviado.' })
  const results = []
  for (const f of files) {
    try {
      const bill = await parseRgeBill(f.buffer)
      upsertElectricityBill(bill, f.originalname)
      results.push({ file: f.originalname, ref: bill.refMonth, status: bill.status, notes: bill.notes })
    } catch (err: any) {
      results.push({ file: f.originalname, ref: null, status: 'error', notes: [err.message] })
    }
  }
  res.json(results)
})

// ?from=YYYY-MM&to=YYYY-MM (by reference month)
router.get('/bills', (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string }
  res.json(queryElectricityBills(from?.slice(0, 7), to?.slice(0, 7)))
})

router.delete('/bills/:ref', (req, res) => {
  if (!/^\d{4}-\d{2}$/.test(req.params.ref)) return res.status(400).json({ error: 'Mês inválido.' })
  res.json({ removed: deleteElectricityBill(req.params.ref) })
})

export default router
