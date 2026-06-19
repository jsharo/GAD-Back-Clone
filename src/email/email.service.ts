import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as sgMail from '@sendgrid/mail';
import { SendEmailPayload } from './email.types';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly isConfigured: boolean;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor() {
    const apiKey = process.env.SENDGRID_API_KEY?.trim();
    this.fromEmail = process.env.SENDGRID_FROM_EMAIL?.trim() ?? '';
    this.fromName = process.env.SENDGRID_FROM_NAME?.trim() ?? 'GAD Municipal de Cañar';

    if (apiKey && this.fromEmail) {
      sgMail.setApiKey(apiKey);
      this.isConfigured = true;
      this.logger.log('SendGrid email transport configured');
    } else {
      this.isConfigured = false;
      this.logger.warn(
        'SendGrid not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL). Emails will be logged only.',
      );
    }
  }

  async send(payload: SendEmailPayload): Promise<void> {
    if (!this.isConfigured) {
      this.logger.log(
        `[EMAIL-DEV] to=${payload.to} subject="${payload.subject}" body="${payload.text}"`,
      );
      return;
    }

    try {
      await sgMail.send({
        to: payload.to,
        from: { email: this.fromEmail, name: this.fromName },
        subject: payload.subject,
        text: payload.text,
        html: payload.html ?? payload.text,
      });
      this.logger.log(`Email sent to ${payload.to}: "${payload.subject}"`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${payload.to}`, error);
      throw new InternalServerErrorException('Could not send email. Please try again later.');
    }
  }
}
