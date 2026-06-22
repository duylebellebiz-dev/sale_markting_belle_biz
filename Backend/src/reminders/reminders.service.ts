import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CustomersService } from '../customers/customers.service';
import { InvoicesService } from '../invoices/invoices.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';
import { BusinessesService } from '../businesses/businesses.service';
import {
  DEFAULT_INVOICE_REMINDER_DAYS,
  DEFAULT_RENEWAL_REMINDER_DAYS,
} from '../businesses/reminder-defaults';
import { EmailCampaignService } from '../email/email-campaign.service';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly customersService: CustomersService,
    private readonly invoicesService: InvoicesService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly notificationsService: NotificationsService,
    private readonly businessesService: BusinessesService,
    private readonly emailCampaignService: EmailCampaignService,
  ) {}

  @Cron('0 8 * * *')
  async runReminderScan() {
    this.logger.log('Reminder scan started');
    await this.scanFollowUps();
    await this.scanInvoices();
    await this.scanRenewals();
    await this.emailCampaignService.dispatchScheduled();
    this.logger.log('Reminder scan complete');
  }

  async triggerNow() {
    this.logger.log('Manual reminder scan triggered');
    await this.scanFollowUps();
    await this.scanInvoices();
    await this.scanRenewals();
    await this.emailCampaignService.dispatchScheduled();
    return { message: 'Reminder scan completed' };
  }

  // ---------------------------------------------------------------------------
  // §7.1 Follow-up reminders
  // ---------------------------------------------------------------------------
  private async scanFollowUps() {
    const due = await this.customersService.findDueFollowUps();

    if (!due.length) {
      this.logger.debug('scanFollowUps — nothing due');
      return;
    }

    this.logger.log(`scanFollowUps — ${due.length} customer(s) due`);

    const results = await Promise.allSettled(
      due.map(async (customer) => {
        await this.notificationsService.create({
          businessId: customer.businessId,
          targetUserId: customer.assignedToId,
          type: NotificationType.followup,
          message: `Follow up with ${customer.customerName} is due`,
          relatedId: customer.id,
        });
        await this.customersService.clearFollowUpDate(customer.id);
      }),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) {
      this.logger.warn(`scanFollowUps — ${failed} notification(s) failed to save`);
    }
  }

  // ---------------------------------------------------------------------------
  // §7.2 Invoice payment reminders
  // invoicesService.findDueInvoices() returns Mongoose docs for now (not yet migrated).
  // The casts below will be cleaned up when invoices migrates to Prisma.
  // ---------------------------------------------------------------------------
  private async scanInvoices() {
    const due = await this.invoicesService.findDueInvoices();

    if (!due.length) {
      this.logger.debug('scanInvoices — nothing due');
      return;
    }

    this.logger.log(`scanInvoices — ${due.length} invoice(s) due`);

    const scheduleCache = new Map<string, number[]>();

    const getInvoiceSchedule = async (businessId: string): Promise<number[]> => {
      if (scheduleCache.has(businessId)) return scheduleCache.get(businessId)!;
      try {
        const raw = await this.businessesService.getReminderSchedule(businessId);
        const config = raw as unknown as { invoiceReminderDays?: number[] };
        const days = config?.invoiceReminderDays?.length
          ? config.invoiceReminderDays
          : DEFAULT_INVOICE_REMINDER_DAYS;
        scheduleCache.set(businessId, days);
        return days;
      } catch {
        scheduleCache.set(businessId, DEFAULT_INVOICE_REMINDER_DAYS);
        return DEFAULT_INVOICE_REMINDER_DAYS;
      }
    };

    let notified = 0;
    let failed = 0;

    for (const inv of due) {
      try {
        const customer = inv.customer;
        const businessId = inv.businessId;
        const schedule = await getInvoiceSchedule(businessId);

        const balance = Number(inv.balanceDue).toFixed(2);
        const invoiceNumber = inv.invoiceNumber;
        const customerName = customer?.customerName ?? 'Customer';
        const promised = inv.promisedPaymentDate;
        const isPromised = promised && new Date(promised) <= new Date();

        const msg = isPromised
          ? `Payment promised for Invoice #${invoiceNumber} (${customerName}) is overdue — balance $${balance}`
          : `Invoice #${invoiceNumber} for ${customerName} — balance due $${balance}`;

        await this.notificationsService.create({
          businessId,
          targetUserId: customer.assignedToId,
          type: NotificationType.invoice,
          message: msg,
          relatedId: inv.id,
        });

        await this.invoicesService.advanceInvoiceReminder(inv.id, schedule);

        notified++;
      } catch (err) {
        failed++;
        this.logger.warn(`scanInvoices — failed: ${(err as Error).message}`);
      }
    }

    this.logger.log(`scanInvoices — notified ${notified}, failed ${failed}`);
  }

  // ---------------------------------------------------------------------------
  // §7.3 Service renewal reminders
  // ---------------------------------------------------------------------------
  private async scanRenewals() {
    const due = await this.subscriptionsService.findDueSubscriptions();

    if (!due.length) {
      this.logger.debug('scanRenewals — nothing due');
      return;
    }

    this.logger.log(`scanRenewals — ${due.length} subscription(s) due`);

    const scheduleCache = new Map<string, number[]>();

    const getRenewalSchedule = async (businessId: string): Promise<number[]> => {
      if (scheduleCache.has(businessId)) return scheduleCache.get(businessId)!;
      try {
        const raw = await this.businessesService.getReminderSchedule(businessId);
        const config = raw as unknown as { renewalReminderDays?: number[] };
        const days = config?.renewalReminderDays?.length
          ? config.renewalReminderDays
          : DEFAULT_RENEWAL_REMINDER_DAYS;
        scheduleCache.set(businessId, days);
        return days;
      } catch {
        scheduleCache.set(businessId, DEFAULT_RENEWAL_REMINDER_DAYS);
        return DEFAULT_RENEWAL_REMINDER_DAYS;
      }
    };

    let notified = 0;
    let failed = 0;

    for (const sub of due) {
      try {
        const businessId = sub.businessId;
        const schedule = await getRenewalSchedule(businessId);
        const now = new Date();
        const isExpired = sub.expiryDate < now;
        const customerName = sub.customer?.customerName ?? 'Customer';
        const serviceName  = sub.service?.name ?? 'service';

        const message = isExpired
          ? `Subscription for ${customerName} (${serviceName}) has expired — please renew or cancel`
          : `Subscription for ${customerName} (${serviceName}) expires on ${sub.expiryDate.toLocaleDateString()}`;

        await this.notificationsService.create({
          businessId,
          targetUserId: sub.customer.assignedToId,
          type: NotificationType.renewal,
          message,
          relatedId: sub.id,
        });

        await this.subscriptionsService.advanceRenewalReminder(sub.id, schedule);

        notified++;
      } catch (err) {
        failed++;
        this.logger.warn(`scanRenewals — failed for subscription ${sub.id}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`scanRenewals — notified ${notified}, failed ${failed}`);
  }
}
