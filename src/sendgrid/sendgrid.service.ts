import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import sgMail from "@sendgrid/mail";
import { SENDGRID_PRICE_TEMPLATE_ID, SENDGRID_REGISTRATION_TEMPLATE_ID } from "./sendgrid.constants";

type SendDynamicTemplateParams = {
  to: string;
  templateId: string;
  dynamicTemplateData: Record<string, string>;
};

@Injectable()
export class SendgridService {
  private readonly log = new Logger(SendgridService.name);

  constructor(private readonly config: ConfigService) {}

  async sendPriceEmail(to: string, price: string): Promise<void> {
    const templateId =
      this.config.get<string>("SENDGRID_PRICE_TEMPLATE_ID")?.trim() ||
      SENDGRID_PRICE_TEMPLATE_ID;
    await this.sendDynamicTemplate({
      to,
      templateId,
      dynamicTemplateData: {
        price: price.trim(),
      },
    });
  }

  async sendWorkspaceInvitationEmail(
    to: string,
    name: string,
    invitationLink: string,
  ): Promise<void> {
    const templateId =
      this.config.get<string>("SENDGRID_PRICE_TEMPLATE_ID")?.trim() ||
      SENDGRID_PRICE_TEMPLATE_ID;
    await this.sendDynamicTemplate({
      to,
      templateId,
      dynamicTemplateData: {
        name: name.trim(),
        invitationLink: invitationLink.trim(),
      },
    });
  }

  async sendRegistrationConfirmationEmail(params: {
    to: string;
    firstName: string;
    companyName: string;
    confirmUrl: string;
  }): Promise<void> {
    const templateId =
      this.config
        .get<string>("SENDGRID_REGISTRATION_TEMPLATE_ID")
        ?.trim() ||
      SENDGRID_REGISTRATION_TEMPLATE_ID;
    await this.sendDynamicTemplate({
      to: params.to,
      templateId,
      dynamicTemplateData: {
        first_name: params.firstName.trim(),
        company_name: params.companyName.trim(),
        confirm_url: params.confirmUrl.trim(),
      },
    });
  }

  private async sendDynamicTemplate(
    params: SendDynamicTemplateParams,
  ): Promise<void> {
    const apiKey = this.config.get<string>("SENDGRID_API_KEY")?.trim();
    const from = this.config.get<string>("SENDGRID_FROM_EMAIL")?.trim();
    if (!apiKey) {
      throw new InternalServerErrorException("SENDGRID_API_KEY is not configured");
    }
    if (!from) {
      throw new InternalServerErrorException(
        "SENDGRID_FROM_EMAIL is not configured",
      );
    }

    sgMail.setApiKey(apiKey);

    try {
      await sgMail.send({
        to: params.to.trim(),
        from,
        templateId: params.templateId,
        dynamicTemplateData: params.dynamicTemplateData,
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(`SendGrid email failed to=${params.to}: ${err}`);
      throw new BadGatewayException("Failed to send email");
    }
  }
}
