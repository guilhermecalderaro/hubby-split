import pdfParse from 'pdf-parse'
import fs from 'fs'

// Testar as duas faturas
for (const file of ['Nubank_2026-08-07.pdf', 'Nubank_2026-08-08.pdf']) {
  console.log(`\n\n========== ${file} ==========`)
  const buf = fs.readFileSync(file)
  const { text } = await pdfParse(buf)
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // Encontrar ano da fatura
  const faturaMatch = text.match(/FATURA\s+\d+\s+\w+\s+(\d{4})/)
  const year = faturaMatch ? faturaMatch[1] : String(new Date().getFullYear())
  console.log(`Ano: ${year}`)

  // Encontrar seção TRANSAÇÕES e pegar até Pagamentos
  const startIdx = lines.findIndex(l => l === 'TRANSAÇÕES')
  const endIdx = lines.findIndex((l, i) => i > startIdx && /Pagamentos e Financiamentos/i.test(l))
  console.log(`Transações linha ${startIdx} até ${endIdx}`)

  const txLines = lines.slice(startIdx + 2, endIdx) // pula "TRANSAÇÕES" e "DE X A Y"

  const MONTHS: Record<string, string> = {
    JAN:'01',FEV:'02',MAR:'03',ABR:'04',MAI:'05',JUN:'06',
    JUL:'07',AGO:'08',SET:'09',OUT:'10',NOV:'11',DEZ:'12'
  }
  const DATE_RE = /^(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)$/

  // Padrão: linha de data + linha de descrição+valor
  let i = 0
  const expenses = []
  while (i < txLines.length) {
    const dateMatch = txLines[i].match(DATE_RE)
    if (dateMatch && i + 1 < txLines.length) {
      const day = dateMatch[1].padStart(2, '0')
      const month = MONTHS[dateMatch[2]]
      const date = `${year}-${month}-${day}`

      const descLine = txLines[i + 1]
      // Remove prefixo de cartão (•••• XXXX)
      const cleaned = descLine.replace(/^[•\s\d]+/, '').trim()
      // Separar descrição do valor: último "R$" ou valor no final
      const amtMatch = cleaned.match(/R\$\s*([\d.,]+)\s*$/)
      if (amtMatch) {
        const description = cleaned.slice(0, cleaned.lastIndexOf('R$')).trim()
        const amount = parseFloat(amtMatch[1].replace('.','').replace(',','.'))
        expenses.push({ date, description, amount })
      }
      i += 2
    } else if (txLines[i].match(/^[A-Z].+R\$\s*[\d.,]+$/)) {
      // Subtotal de cartão (ex: "John DoeR$ 99,90") — pular
      i++
    } else {
      i++
    }
  }

  console.log(`\n${expenses.length} despesas encontradas:`)
  expenses.forEach(e => console.log(`  ${e.date} | R$ ${e.amount.toFixed(2)} | ${e.description}`))
}
