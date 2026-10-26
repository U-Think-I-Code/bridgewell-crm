import { NextRequest, NextResponse } from 'next/server'
import nodemailer, { type Transporter } from 'nodemailer'
import { getSmtpConfig } from '@/lib/emailService'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { to, subject, body: emailBody, leadId, senderName, senderEmail, counselorSmtp } = body

    if (!to || !subject || !emailBody) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: to, subject, or body' },
        { status: 400 }
      )
    }

    // 1. Check if the counselor has provided their own personal SMTP credentials
    let transporter: Transporter
    let fromAddress: string
    let replyToAddress: string

    if (counselorSmtp && counselorSmtp.user && counselorSmtp.pass) {
      // Counselor personal SMTP (e.g. counselor's personal Gmail App Password)
      const portNum = Number(counselorSmtp.port) || 465
      const isSecure = counselorSmtp.secure ?? (portNum === 465)
      transporter = nodemailer.createTransport({
        host: counselorSmtp.host || 'smtp.gmail.com',
        port: portNum,
        secure: isSecure,
        auth: {
          user: counselorSmtp.user,
          pass: counselorSmtp.pass,
        },
      })
      fromAddress = senderName 
        ? `"${senderName}" <${counselorSmtp.user}>` 
        : counselorSmtp.user
      replyToAddress = counselorSmtp.user
    } else {
      // Fallback to central organization SMTP
      const config = getSmtpConfig()

      if (!config) {
        return NextResponse.json(
          {
            success: false,
            error: 'SMTP_NOT_CONFIGURED',
            message: 'Direct CRM sending is not configured yet. You can use the "🌐 Send via My Gmail" button or ask Admin to setup SMTP in Settings.'
          },
          { status: 400 }
        )
      }

      transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.pass,
        },
      })

      // Show counselor name as the sender with company domain
      const displayName = senderName 
        ? `${senderName} (Bridgewell)` 
        : (config.fromName || 'Bridgewell Education Advisory')

      fromAddress = `"${displayName}" <${config.fromEmail}>`
      // Replies from student go directly to the specific counselor's personal inbox!
      replyToAddress = senderEmail || config.fromEmail
    }

    const mailOptions = {
      from: fromAddress,
      to,
      replyTo: replyToAddress,
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
