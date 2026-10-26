import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { getSmtpConfig, saveSmtpConfig, SmtpConfig } from '@/lib/emailService'

export const dynamic = 'force-dynamic'

// GET: returns current status and configuration (password masked)
export async function GET() {
  try {
    const config = getSmtpConfig()

    if (!config) {
      return NextResponse.json({
        configured: false,
        config: null
      })
    }

    return NextResponse.json({
      configured: true,
      config: {
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.user,
        pass: '••••••••••••••••', // Masked for security
        fromName: config.fromName,
        fromEmail: config.fromEmail,
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST: Tests and saves new SMTP configuration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { host, port, secure, user, pass, fromName, fromEmail, testRecipient } = body

    if (!host || !user || !pass) {
      return NextResponse.json(
        { success: false, error: 'Host, Username/Email, and Password are required.' },
        { status: 400 }
      )
    }

    const portNum = Number(port) || 465
    const isSecure = secure ?? (portNum === 465)

    // 1. Verify credentials by attempting a connection
    const transporter = nodemailer.createTransport({
      host,
      port: portNum,
      secure: isSecure,
      auth: {
        user,
        pass,
      },
    })

    await transporter.verify()

    // 2. If testRecipient is provided, send a quick test email
    let testSent = false
    if (testRecipient && typeof testRecipient === 'string' && testRecipient.includes('@')) {
      await transporter.sendMail({
        from: fromName ? `"${fromName}" <${fromEmail || user}>` : (fromEmail || user),
        to: testRecipient,
        subject: '✅ Bridgewell CRM — SMTP Email Connection Successful',
        text: `Congratulations! Your direct CRM email delivery is properly configured and operational.\n\nSent from: ${user}\nHost: ${host}:${portNum}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; background: #f9f9f9; border-radius: 12px; max-width: 500px; margin: auto; border: 1px solid #e0e0e0;">
            <h2 style="color: #059669; margin-top: 0;">✅ SMTP Connection Successful!</h2>
            <p style="color: #333; font-size: 14px; line-height: 1.5;">
              Congratulations! Your Bridgewell CRM direct email system is now verified and active.
            </p>
            <div style="background: #ffffff; padding: 12px; border-radius: 8px; font-size: 13px; color: #555; border: 1px solid #eee;">
              <strong>Host:</strong> ${host}:${portNum}<br/>
              <strong>Sender:</strong> ${user}<br/>
              <strong>Display Name:</strong> ${fromName || 'Bridgewell Education Advisory'}
            </div>
            <p style="color: #777; font-size: 12px; margin-top: 15px;">
              Counselors can now send emails directly from student profiles with 1-click.
            </p>
          </div>
        `,
      })
      testSent = true
    }

    // 3. Save configuration
    const newConfig: SmtpConfig = {
      host,
      port: portNum,
      secure: isSecure,
      user,
      pass,
      fromName: fromName || 'Bridgewell Education Advisory',
      fromEmail: fromEmail || user,
    }

    saveSmtpConfig(newConfig)

    return NextResponse.json({
      success: true,
      message: testSent 
        ? `SMTP credentials verified & test email sent to ${testRecipient}!` 
        : 'SMTP credentials verified and saved successfully!'
    })
  } catch (err: any) {
    console.error('[SmtpConfigAPI] Verification error:', err)
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'SMTP verification failed. Please check host, username, or App Password.'
      },
      { status: 400 }
    )
  }
}
