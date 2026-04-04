import nodemailer from 'nodemailer';
import dns from 'dns';
import { env } from '../../config/env';

// ── Lazy transporter ────────────────────────────────────────────────────────
// Railway blocks outbound IPv6. Using `service: 'gmail'` lets nodemailer do
// its own DNS lookup which returns an IPv6 address first, causing ENETUNREACH.
// Fix: skip the 'service' shorthand, use explicit host/port, and override the
// lookup function to always resolve via dns.resolve4 (IPv4 only).
let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter;
  // Port 587 + STARTTLS — Railway blocks outbound 465 (SSL), 587 is open.
  // requireTLS ensures the connection upgrades to TLS even though secure:false.
  // IPv4 forced via custom lookup — Railway has no outbound IPv6 routing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transportOptions: any = {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: env.GMAIL_USER,
      pass: env.GMAIL_APP_PASSWORD,
    },
    lookup: (hostname: string, _options: unknown, callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
      dns.resolve4(hostname, (err, addresses) => {
        if (err) return callback(err, '', 4);
        callback(null, addresses[0], 4);
      });
    },
  };
  _transporter = nodemailer.createTransport(transportOptions);
  return _transporter;
}

// ── HTML escaping ───────────────────────────────────────────────────────────
// Prevents XSS when user-supplied values (names, emails) are embedded in HTML.
// Must be applied to every untrusted string before template interpolation.
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':  return '&amp;';
      case '<':  return '&lt;';
      case '>':  return '&gt;';
      case '"':  return '&quot;';
      case "'":  return '&#39;';
      default:   return ch;
    }
  });
}

// ── HTML builder ────────────────────────────────────────────────────────────
function otpHtml(name: string, otp: string): string {
  const safeName = escapeHtml(name);
  return `
    <!DOCTYPE html>
    <html>
      <body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
        <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px;
                    padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #008751; margin: 0; font-size: 24px;">Corpers Connect</h1>
            <p style="color: #666; margin: 4px 0 0;">Connecting Nigeria's Corps Members</p>
          </div>
          <p style="color: #333; font-size: 16px;">Hello <strong>${safeName}</strong>,</p>
          <p style="color: #555;">Your verification code is:</p>
          <div style="background: #f0faf4; border: 2px solid #008751; border-radius: 8px;
                      padding: 20px; text-align: center; margin: 20px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #008751;">
              ${otp}
            </span>
          </div>
          <p style="color: #555; font-size: 14px;">
            This code expires in <strong>10 minutes</strong>. Do not share it with anyone.
          </p>
          <p style="color: #555; font-size: 14px;">
            If you did not request this, please ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            © ${new Date().getFullYear()} Corpers Connect · All rights reserved
          </p>
        </div>
      </body>
    </html>
  `;
}

export const emailService = {
  async sendOTP(to: string, name: string, otp: string, purpose: string): Promise<void> {
    const subjects: Record<string, string> = {
      registration:     'Verify your Corpers Connect account',
      'forgot-password': 'Reset your Corpers Connect password',
      '2fa':            'Your Corpers Connect login code',
      'email-change':   'Verify your new Corpers Connect email address',
    };

    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: `"Corpers Connect" <${env.GMAIL_USER}>`,
      to,
      subject: subjects[purpose] ?? 'Your Corpers Connect OTP',
      html: otpHtml(name, otp),
    });

    console.info(`[EMAIL] ${purpose} OTP → ${to} | messageId: ${info.messageId}`);
  },

  async sendRenewalSuccess(to: string, name: string, endDate: string): Promise<void> {
    const safeName = escapeHtml(name);
    const safeDate = escapeHtml(new Date(endDate).toLocaleDateString('en-NG', { dateStyle: 'long' }));
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"Corpers Connect" <${env.GMAIL_USER}>`,
      to,
      subject: 'Your Corpers Connect subscription has been renewed',
      html: `
        <!DOCTYPE html>
        <html>
          <body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
            <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="color: #008751; margin: 0;">Corpers Connect</h1>
              </div>
              <p>Hello <strong>${safeName}</strong>,</p>
              <p>Your <strong>Premium</strong> subscription has been automatically renewed. ✅</p>
              <p>Your new expiry date is <strong>${safeDate}</strong>.</p>
              <p>Thank you for being part of the Corpers Connect community!</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} Corpers Connect
              </p>
            </div>
          </body>
        </html>
      `,
    });
  },

  async sendRenewalFailed(to: string, name: string): Promise<void> {
    const safeName = escapeHtml(name);
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"Corpers Connect" <${env.GMAIL_USER}>`,
      to,
      subject: 'Action required: Corpers Connect subscription renewal failed',
      html: `
        <!DOCTYPE html>
        <html>
          <body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
            <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="color: #008751; margin: 0;">Corpers Connect</h1>
              </div>
              <p>Hello <strong>${safeName}</strong>,</p>
              <p>We were unable to automatically renew your <strong>Premium</strong> subscription. ⚠️</p>
              <p>Your account will revert to the free tier when your current plan expires.</p>
              <p>
                To continue enjoying Premium features, please
                <a href="${env.CLIENT_URL}/subscription" style="color: #008751;">renew your subscription</a>
                manually.
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} Corpers Connect
              </p>
            </div>
          </body>
        </html>
      `,
    });
  },

  async sendWelcome(to: string, name: string, defaultPassword: string): Promise<void> {
    const safeName     = escapeHtml(name);
    const safeTo       = escapeHtml(to);
    const safePassword = escapeHtml(defaultPassword);
    const transporter  = getTransporter();
    await transporter.sendMail({
      from: `"Corpers Connect" <${env.GMAIL_USER}>`,
      to,
      subject: 'Welcome to Corpers Connect!',
      html: `
        <!DOCTYPE html>
        <html>
          <body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
            <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="color: #008751; margin: 0;">Corpers Connect</h1>
              </div>
              <p>Hello <strong>${safeName}</strong>,</p>
              <p>Your Corpers Connect account has been created by an admin. Welcome to the community!</p>
              <p><strong>Your login credentials:</strong></p>
              <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <p style="margin: 0; color: #555;">Email: <strong>${safeTo}</strong></p>
                <p style="margin: 8px 0 0; color: #555;">Default Password: <strong>${safePassword}</strong></p>
              </div>
              <p style="color: #e74c3c; font-size: 14px;">
                <strong>Please change your password immediately after logging in.</strong>
              </p>
              <p>Login at: <a href="${env.CLIENT_URL}" style="color: #008751;">${env.CLIENT_URL}</a></p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} Corpers Connect
              </p>
            </div>
          </body>
        </html>
      `,
    });
  },
};
