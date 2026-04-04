import { emailService } from '../../shared/services/email.service';
import type { EmailJobData } from '../types';

/**
 * Process an email job — called by the BullMQ worker and also directly in tests.
 */
export async function processEmailJob(data: EmailJobData): Promise<void> {
  if (data.type === 'SEND_OTP') {
    await emailService.sendOTP(data.to, data.name, data.otp, data.purpose);
  } else if (data.type === 'SEND_WELCOME') {
    await emailService.sendWelcome(data.to, data.name, data.defaultPassword ?? '');
  } else if (data.type === 'SEND_RENEWAL_SUCCESS') {
    await emailService.sendRenewalSuccess(data.to, data.name, data.endDate);
  } else if (data.type === 'SEND_RENEWAL_FAILED') {
    await emailService.sendRenewalFailed(data.to, data.name);
  }
}
