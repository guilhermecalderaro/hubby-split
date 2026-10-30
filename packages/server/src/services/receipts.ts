import { Receipt, ReceiptItem } from '../types'

const NFCE_URL = 'https://www.sefaz.rs.gov.br/ASP/AAE_ROOT/NFE/SAT-WEB-NFE-NFC_2.asp'

// Consulta NF-e exige login gov.br + reCAPTCHA; o usuário baixa o XML por aqui
export function nfePortalUrl(accessKey: string): string {
  return `https://www.sefaz.rs.gov.br/NFE/NFE-COM.aspx?HML=false&chaveNFe=${accessKey}`
}

// Consulta pública da NFC-e no navegador (alternativa manual se a automática falhar)
export function nfcePortalUrl(accessKey: string): string {
  return `https://www.sefaz.rs.gov.br/NFE/NFE-NFC.aspx?chaveNFe=${accessKey}`
}

export class ManualLookupRequired extends Error {}

export function normalizeAccessKey(raw: string): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '')
  return digits.length === 44 ? digits : null
}

// Posições 21-22 da chave de acesso: 55 = NF-e, 65 = NFC-e
export function receiptModel(accessKey: string): string {
  return accessKey.slice(20, 22)
}

function brNumber(raw: string): number {
  const s = raw.replace(/[^\d,.-]/g, '')
  return parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s) || 0
}

const round2 = (n: number) => Math.round(n * 100) / 100

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function cellText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/**
 * Ajusta o valor líquido de cada item para que a soma bata com o total pago,
 * distribuindo descontos/acréscimos não atribuídos a itens proporcionalmente.
 */
function allocateNet(items: Omit<ReceiptItem, 'amount'>[], netTotal: number): ReceiptItem[] {
  const base = items.map(i => i.total - i.discount)
  const baseSum = base.reduce((a, b) => a + b, 0)
  const extra = netTotal - baseSum
  const result = items.map((item, idx) => ({
    ...item,
    amount: round2(base[idx] + (baseSum > 0 ? extra * (base[idx] / baseSum) : 0)),
  }))

  // Centavos de arredondamento vão para o maior item
  const diff = round2(netTotal - result.reduce((a, i) => a + i.amount, 0))
  if (diff !== 0 && result.length > 0) {
    const largest = result.reduce((max, i) => (i.amount > max.amount ? i : max), result[0])
    largest.amount = round2(largest.amount + diff)
  }
  return result
}

export function parseNfceHtml(html: string, accessKey: string): Receipt {
  const rows = [...html.matchAll(/<tr[^>]*id="Item \+ \d+"[^>]*>([\s\S]*?)<\/tr>/g)]
  const items = rows.map(([, row]) => {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => cellText(m[1]))
    const [code, description, qty, unit, unitPrice, total] = cells
    return {
      code: code ?? '',
      description: description ?? '',
      quantity: brNumber(qty ?? '0'),
      unit: unit ?? '',
      unitPrice: brNumber(unitPrice ?? '0'),
      total: brNumber(total ?? '0'),
      discount: 0,
    }
  })
  if (items.length === 0) throw new Error('Nenhum item encontrado na NFC-e. Verifique a chave de acesso.')

  const label = (re: RegExp): number | null => {
    const m = html.match(new RegExp(`<td[^>]*>\\s*${re.source}\\s*</td>\\s*<td[^>]*>([^<]*)</td>`, 'i'))
    return m ? brNumber(m[1]) : null
  }
  const gross = label(/Valor total R\$/) ?? items.reduce((a, i) => a + i.total, 0)
  const discount = label(/Valor descontos R\$/) ?? 0
  const surcharge = label(/Valor acr[ée]scimos R\$/) ?? 0
  const toPay = label(/Valor a pagar R\$/)
  const netTotal = round2(toPay ?? gross - discount + surcharge)

  const issuerMatch = html.match(/class="NFCCabecalho_SubTitulo"[^>]*>([^<]+)</)

  return {
    accessKey,
    model: '65',
    issuer: issuerMatch ? cellText(issuerMatch[1]) : '',
    total: netTotal,
    items: allocateNet(items, netTotal),
  }
}

export async function fetchNfce(accessKey: string): Promise<Receipt> {
  const res = await fetch(NFCE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
    body: new URLSearchParams({ HML: 'false', chaveNFe: accessKey }).toString(),
  })
  if (!res.ok) throw new Error(`Consulta SEFAZ-RS falhou: ${res.status}`)
  // Página servida em ISO-8859-1
  const html = new TextDecoder('latin1').decode(await res.arrayBuffer())
  // Hoje a consulta NFC-e não pede captcha; se a SEFAZ passar a exigir, cai no fluxo manual
  if (!/id="Item \+ \d+"/.test(html) && /captcha/i.test(html)) {
    throw new ManualLookupRequired('A SEFAZ pediu verificação (captcha) para esta consulta. Abra a nota no portal, salve a página (Ctrl+S) e envie aqui.')
  }
  return parseNfceHtml(html, accessKey)
}

function xmlTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`))
  return m ? decodeEntities(m[1].trim()) : null
}

const xmlNum = (xml: string, tag: string) => parseFloat(xmlTag(xml, tag) ?? '0') || 0

// XML padrão nacional (nfeProc/NFe), serve para NF-e (55) e NFC-e (65)
export function parseNfeXml(xml: string): Receipt {
  const infNFe = xml.match(/<(?:\w+:)?infNFe[^>]*\bId="NFe(\d{44})"/)
  if (!infNFe) throw new Error('Arquivo não parece ser um XML de NF-e/NFC-e.')
  const accessKey = infNFe[1]

  const dets = [...xml.matchAll(/<(?:\w+:)?det\b[^>]*>([\s\S]*?)<\/(?:\w+:)?det>/g)].map(m => m[1])
  const items = dets.map(det => {
    const prod = xmlTag(det, 'prod') ?? ''
    return {
      code: xmlTag(prod, 'cProd') ?? '',
      description: xmlTag(prod, 'xProd') ?? '',
      quantity: xmlNum(prod, 'qCom'),
      unit: xmlTag(prod, 'uCom') ?? '',
      unitPrice: xmlNum(prod, 'vUnCom'),
      total: xmlNum(prod, 'vProd'),
      discount: xmlNum(prod, 'vDesc'),
    }
  })
  if (items.length === 0) throw new Error('Nenhum item encontrado no XML.')

  const emit = xmlTag(xml, 'emit') ?? ''
  const totals = xmlTag(xml, 'ICMSTot') ?? ''
  const netTotal = round2(xmlNum(totals, 'vNF'))

  return {
    accessKey,
    model: receiptModel(accessKey),
    issuer: xmlTag(emit, 'xFant') ?? xmlTag(emit, 'xNome') ?? '',
    total: netTotal,
    items: allocateNet(items, netTotal),
  }
}

function labeledValue(html: string, label: string): string | null {
  const m = html.match(new RegExp(`<label>\\s*${label}\\s*</label>\\s*<span>([\\s\\S]*?)</span>`))
  return m ? cellText(m[1]) : null
}

// Página "Consulta Pública" do portal DFe (logado com gov.br), salva com Ctrl+S
export function parseNfePortalHtml(html: string): Receipt {
  const keyMatch = cellText(html.match(/Dados da NF-e:([\s\S]*?)<\//)?.[1] ?? '').replace(/\D/g, '')
  const accessKey = normalizeAccessKey(keyMatch)
  if (!accessKey) throw new Error('Não encontrei a chave de acesso na página salva.')

  const chunks = html.split(/<table class="toggle box">/).slice(1)
  const items = chunks
    .map(chunk => {
      const cell = (cls: string) => cellText(chunk.match(new RegExp(`class="fixo-prod-serv-${cls}"[^>]*>([\\s\\S]*?)</td>`))?.[1] ?? '')
      const description = cell('descricao')
      if (!description) return null
      const quantity = brNumber(cell('qtd'))
      const total = brNumber(cell('vb'))
      return {
        code: labeledValue(chunk, 'Código do Produto') ?? '',
        description,
        quantity,
        unit: cell('uc'),
        unitPrice: brNumber(labeledValue(chunk, 'Valor unitário de comercialização') ?? '') || (quantity ? round2(total / quantity) : total),
        total,
        discount: brNumber(labeledValue(chunk, 'Valor do Desconto') ?? ''),
      }
    })
    .filter((i): i is NonNullable<typeof i> => i !== null)
  if (items.length === 0) throw new Error('Nenhum item encontrado na página salva. Abra a aba "Produtos e Serviços" antes de salvar?')

  const netTotal = round2(brNumber(labeledValue(html, 'Valor Total da NFe') ?? '') || items.reduce((a, i) => a + i.total - i.discount, 0))

  return {
    accessKey,
    model: receiptModel(accessKey),
    issuer: labeledValue(html, 'Nome Fantasia') || labeledValue(html, 'Nome / Razão Social') || '',
    total: netTotal,
    items: allocateNet(items, netTotal),
  }
}

// Aceita XML da nota, página do portal DFe salva, ou página da consulta NFC-e salva
export function parseReceiptFile(buffer: Buffer): Receipt {
  let text = buffer.toString('utf8')
  if (text.includes('\uFFFD')) text = new TextDecoder('latin1').decode(buffer)

  if (/<(?:\w+:)?infNFe\b/.test(text)) return parseNfeXml(text)
  if (text.includes('fixo-prod-serv-')) return parseNfePortalHtml(text)
  if (/id="Item \+ \d+"/.test(text)) {
    const key = normalizeAccessKey(text.match(/CHAVE DE ACESSO[\s\S]*?((?:\d{4}\s*){11})/)?.[1] ?? '')
    if (!key) throw new Error('Não encontrei a chave de acesso na página da NFC-e.')
    return parseNfceHtml(text, key)
  }
  throw new Error('Arquivo não reconhecido. Envie o XML da nota ou a página do portal salva com Ctrl+S.')
}
