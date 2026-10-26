import fs from 'fs'
import path from 'path'

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  fromName: string
  fromEmail: string
}

const CONFIG_PATH = path.join(process.cwd(), 'smtp-config.json')

export function getSmtpConfig(): SmtpConfig | null {
  // 1. Check environment variables first
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const port = Number(process.env.SMTP_PORT) || 465
    return {
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      fromName: process.env.SMTP_FROM_NAME || 'Bridgewell Education Advisory',
      fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
    }
  }

  // 2. Check local smtp-config.json file
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8')
      const parsed = JSON.parse(content)
      if (parsed.host && parsed.user && parsed.pass) {
        const port = Number(parsed.port) || 465
        return {
          host: parsed.host,
          port,
          secure: parsed.secure ?? (port === 465),
          user: parsed.user,
          pass: parsed.pass,
          fromName: parsed.fromName || 'Bridgewell Education Advisory',
          fromEmail: parsed.fromEmail || parsed.user,
        }
      }
    }
  } catch (err) {
    console.error('[EmailService] Error reading smtp-config.json:', err)
  }

  return null
}

export function saveSmtpConfig(config: SmtpConfig): void {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
  } catch (err) {
    console.error('[EmailService] Error writing smtp-config.json:', err)
    throw err
  }
}
