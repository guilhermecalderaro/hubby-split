import express from 'express'
import cors from 'cors'
import settingsRouter from './routes/settings'
import splitwiseRouter from './routes/splitwise'
import historyRouter from './routes/history'
import importRouter from './routes/import'
import pendingRouter from './routes/pending'
import receiptsRouter from './routes/receipts'

const app = express()
const PORT = 3001
// Bind to loopback only: the API has no auth and holds the Splitwise key
const HOST = '127.0.0.1'

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

app.use('/api/settings', settingsRouter)
app.use('/api/splitwise', splitwiseRouter)
app.use('/api/history', historyRouter)
app.use('/api/import', importRouter)
app.use('/api/pending', pendingRouter)
app.use('/api/receipts', receiptsRouter)

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`)
})
