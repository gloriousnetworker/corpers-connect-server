import { Resend } from 'resend';
import { env } from '../../config/env';

// ── Resend client (HTTP API — works on Railway, unlike SMTP which is blocked) ──
let _resend: Resend | null = null;

function getResend(): Resend {
  if (_resend) return _resend;
  _resend = new Resend(env.RESEND_API_KEY);
  return _resend;
}

// ── HTML escaping ───────────────────────────────────────────────────────────
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

async function send(to: string, subject: string, html: string, tag: string): Promise<void> {
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
  });

  if (error) {
    console.error(`[EMAIL] ❌ ${tag} → ${to}:`, error);
    throw new Error(error.message);
  }

  console.info(`[EMAIL] ✅ ${tag} → ${to} | id: ${data?.id}`);
}

export const emailService = {
  async sendOTP(to: string, name: string, otp: string, purpose: string): Promise<void> {
    const subjects: Record<string, string> = {
      registration:      'Verify your Corpers Connect account',
      'forgot-password': 'Reset your Corpers Connect password',
      '2fa':             'Your Corpers Connect login code',
      'email-change':    'Verify your new Corpers Connect email address',
    };
    await send(to, subjects[purpose] ?? 'Your Corpers Connect OTP', otpHtml(name, otp), `${purpose} OTP`);
  },

  async sendRenewalSuccess(to: string, name: string, endDate: string): Promise<void> {
    const safeName = escapeHtml(name);
    const safeDate = escapeHtml(new Date(endDate).toLocaleDateString('en-NG', { dateStyle: 'long' }));
    const html = `
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
    `;
    await send(to, 'Your Corpers Connect subscription has been renewed', html, 'renewal-success');
  },

  async sendRenewalFailed(to: string, name: string): Promise<void> {
    const safeName = escapeHtml(name);
    const html = `
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
    `;
    await send(to, 'Action required: Corpers Connect subscription renewal failed', html, 'renewal-failed');
  },

  async sendWelcome(to: string, name: string, defaultPassword: string): Promise<void> {
    const safeName     = escapeHtml(name);
    const safeTo       = escapeHtml(to);
    const safePassword = escapeHtml(defaultPassword);
    const html = `
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
    `;
    await send(to, 'Welcome to Corpers Connect!', html, 'welcome');
  },
};
