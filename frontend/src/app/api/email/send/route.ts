import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { getSmtpConfig } from '@/lib/emailService'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { to, subject, body: emailBody, leadId, senderName, senderEmail } = body

    if (!to || !subject || !emailBody) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: to, subject, or body' },
        { status: 400 }
      )
    }

    const config = getSmtpConfig()

    if (!config) {
      return NextResponse.json(
        {
          success: false,
          error: 'SMTP_NOT_CONFIGURED',
          message: 'Direct SMTP sending is not configured yet. Please configure your Gmail/SMTP in Settings.'
        },
        { status: 400 }
      )
    }

    // Create Transporter
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    })

    const fromAddress = config.fromName 
      ? `"${config.fromName}" <${config.fromEmail}>` 
      : config.fromEmail

    const mailOptions = {
      from: fromAddress,
      to,
      replyTo: senderEmail || config.fromEmail,
      subject,
      text: emailBody,
      html: emailBody
        .split('\n')
        .map((line: string) => `<p style="margin: 0 0 10px 0; font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5;">${line ? line : '&nbsp;'}</p>`)
        .join(''),
    }

    const info = await transporter.sendMail(mailOptions)

    // Log to activities in database
    if (leadId) {
      try {
        await supabase.from('activities').insert([
          {
            lead: leadId,
            type: 'email',
            outcome: 'Sent',
            text: `✉️ Sent email: "${subject}"\n• To: ${to}\n• From: ${fromAddress}\n\n--- Content ---\n${emailBody}`,
            time: new Date().toISOString(),
          }
        ])
      } catch (logErr) {
        console.error('[SendEmailAPI] Error logging email activity:', logErr)
      }
    }

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      message: `Email successfully sent to ${to}`
    })
  } catch (error: any) {
    console.error('[SendEmailAPI] Error sending email:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to send email',
        code: error.code || 'EMAIL_SEND_FAILED'
      },
      { status: 500 }
    )
  }
}
