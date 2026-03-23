import { Resend } from 'resend';
import { env } from '../../config/env';

const resend = new Resend(env.RESEND_API_KEY);

export const emailService = {
  async sendOTP(to: string, name: string, otp: string, purpose: string): Promise<void> {
    const subjects: Record<string, string> = {
      registration: 'Verify your Corpers Connect account',
      'forgot-password': 'Reset your Corpers Connect password',
      '2fa': 'Your Corpers Connect login code',
    };

    const result = await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject: subjects[purpose] ?? 'Your Corpers Connect OTP',
      html: `
        <!DOCTYPE html>
        <html>
          <body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
            <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
              <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="color: #008751; margin: 0; font-size: 24px;">Corpers Connect</h1>
                <p style="color: #666; margin: 4px 0 0;">Connecting Nigeria's Corps Members</p>
              </div>
              <p style="color: #333; font-size: 16px;">Hello <strong>${name}</strong>,</p>
              <p style="color: #555;">Your verification code is:</p>
              <div style="background: #f0faf4; border: 2px solid #008751; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
                <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #008751;">${otp}</span>
              </div>
              <p style="color: #555; font-size: 14px;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
              <p style="color: #555; font-size: 14px;">If you did not request this, please ignore this email.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
              <p style="color: #999; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} Corpers Connect · All rights reserved</p>
            </div>
          </body>
        </html>
      `,
    });

    if (result.error) {
      console.error(`[EMAIL ERROR] Failed to send ${purpose} OTP to ${to}:`, result.error);
      throw new Error(`Email delivery failed: ${result.error.message}`);
    }

    console.info(`[EMAIL] ${purpose} OTP sent successfully to ${to} | id: ${result.data?.id}`);
  },

  async sendWelcome(to: string, name: string, defaultPassword: string): Promise<void> {
    await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject: 'Welcome to Corpers Connect! 🎉',
      html: `
        <!DOCTYPE html>
        <html>
          <body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
            <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="color: #008751; margin: 0;">Corpers Connect</h1>
              </div>
              <p>Hello <strong>${name}</strong>,</p>
              <p>Your Corpers Connect account has been created by an admin. Welcome to the community!</p>
              <p><strong>Your login credentials:</strong></p>
              <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <p style="margin: 0; color: #555;">Email: <strong>${to}</strong></p>
                <p style="margin: 8px 0 0; color: #555;">Default Password: <strong>${defaultPassword}</strong></p>
              </div>
              <p style="color: #e74c3c; font-size: 14px;"><strong>Please change your password immediately after logging in.</strong></p>
              <p>Login at: <a href="${env.CLIENT_URL}" style="color: #008751;">${env.CLIENT_URL}</a></p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
              <p style="color: #999; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} Corpers Connect</p>
            </div>
          </body>
        </html>
      `,
    });
  },
};
