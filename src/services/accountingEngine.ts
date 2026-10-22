import { PrismaClient } from '@prisma/client';

export class AccountingEngine {
  constructor(private prisma: PrismaClient) {}

  /**
   * 1. قيد استحقاق الاشتراكات التأمينية (عند إقرار الرواتب الشهرية)
   * من حـ/ اشتراكات تحت التحصيل (مدين)
   *   إلى حـ/ إيرادات اشتراكات التأمين (دائن)
   */
  async recordWageDeclarationEntry(params: {
    wageDeclarationId: string;
    establishmentName: string;
    month: number;
    year: number;
    totalAmount: number;
  }) {
    const entryNo = `JV-WAGE-${params.year}${String(params.month).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;

    return await this.prisma.$transaction(async (tx) => {
      // جلب الحسابات المحاسبية المقابلة
      const receivableAccount = await tx.account.findUniqueOrThrow({
        where: { accountCode: '1201' }, // اشتراكات مستحقة تحت التحصيل
      });
      const revenueAccount = await tx.account.findUniqueOrThrow({
        where: { accountCode: '4101' }, // إيرادات اشتراكات المنشآت
      });

      // إنشاء القيد المحاسبي المتزن
      const entry = await tx.journalEntry.create({
        data: {
          entryNo,
          description: `قيد استحقاق اشتراكات شهر ${params.month}/${params.year} لمنشأة: ${params.establishmentName}`,
          referenceType: 'WAGE_DECLARATION',
          referenceId: params.wageDeclarationId,
          isPosted: true,
          lines: {
            create: [
              {
                accountId: receivableAccount.id,
                debit: params.totalAmount,
                credit: 0,
                lineDescription: `مدين: استحقاق اشتراكات منشأة ${params.establishmentName}`,
              },
              {
                accountId: revenueAccount.id,
                debit: 0,
                credit: params.totalAmount,
                lineDescription: `دائن: إيرادات اشتراكات تأمينية عن شهر ${params.month}/${params.year}`,
              },
            ],
          },
        },
      });

      // تحديث أرصدة الحسابات
      await tx.account.update({
        where: { id: receivableAccount.id },
        data: { currentBalance: { increment: params.totalAmount } },
      });
      await tx.account.update({
        where: { id: revenueAccount.id },
        data: { currentBalance: { increment: params.totalAmount } },
      });

      return entry;
    });
  }

  /**
   * 2. قيد تحصيل وقبض السداد الإلكتروني عن بعد
   * من حـ/ البنك أو وسيط التحصيل (مدين)
   *   إلى حـ/ اشتراكات تحت التحصيل (دائن)
   */
  async recordPaymentEntry(params: {
    paymentId: string;
    transactionNo: string;
    invoiceNo: string;
    establishmentName: string;
    amount: number;
  }) {
    const entryNo = `RV-PAY-${Date.now().toString().slice(-6)}`;

    return await this.prisma.$transaction(async (tx) => {
      const bankAccount = await tx.account.findUniqueOrThrow({
        where: { accountCode: '1101' }, // حساب البنك والتحصيل الإلكتروني
      });
      const receivableAccount = await tx.account.findUniqueOrThrow({
        where: { accountCode: '1201' }, // اشتراكات مستحقة تحت التحصيل
      });

      // تسجيل القيد
      const entry = await tx.journalEntry.create({
        data: {
          entryNo,
          description: `سند قبض إلكتروني لفاتورة رقم ${params.invoiceNo} - منشأة ${params.establishmentName}`,
          referenceType: 'PAYMENT',
          referenceId: params.paymentId,
          isPosted: true,
          lines: {
            create: [
              {
                accountId: bankAccount.id,
                debit: params.amount,
                credit: 0,
                lineDescription: `مدين: تحصيل سداد بنكي برقم حركة ${params.transactionNo}`,
              },
              {
                accountId: receivableAccount.id,
                debit: 0,
                credit: params.amount,
                lineDescription: `دائن: سداد اشتراكات منشأة ${params.establishmentName}`,
              },
            ],
          },
        },
      });

      // تحديث الأرصدة
      await tx.account.update({
        where: { id: bankAccount.id },
        data: { currentBalance: { increment: params.amount } },
      });
      await tx.account.update({
        where: { id: receivableAccount.id },
        data: { currentBalance: { decrement: params.amount } },
      });

      return entry;
    });
  }

  /**
   * 3. قيد استحقاق وصرف منحة الزواج
   * من حـ/ مصروفات المنافع التأمينية - منح الزواج (مدين)
   *   إلى حـ/ البنك أو أمانات المستفيدين (دائن)
   */
  async recordMarriageGrantDisbursementEntry(params: {
    claimId: string;
    claimNo: string;
    beneficiaryName: string;
    amount: number;
  }) {
    const entryNo = `PV-GRANT-${Date.now().toString().slice(-6)}`;

    return await this.prisma.$transaction(async (tx) => {
      const expenseAccount = await tx.account.findUniqueOrThrow({
        where: { accountCode: '5102' }, // مصروفات منافع تأمينية - منح زواج
      });
      const bankAccount = await tx.account.findUniqueOrThrow({
        where: { accountCode: '1101' }, // حساب البنك المصروف منه
      });

      const entry = await tx.journalEntry.create({
        data: {
          entryNo,
          description: `قيد صرف منحة زواج للمؤمن عليه: ${params.beneficiaryName} - معاملة رقم ${params.claimNo}`,
          referenceType: 'MARRIAGE_GRANT',
          referenceId: params.claimId,
          isPosted: true,
          lines: {
            create: [
              {
                accountId: expenseAccount.id,
                debit: params.amount,
                credit: 0,
                lineDescription: `مدين: مصروفات منحة زواج للمؤمن عليه ${params.beneficiaryName}`,
              },
              {
                accountId: bankAccount.id,
                debit: 0,
                credit: params.amount,
                lineDescription: `دائن: تحويل بنكي للمستفيد`,
              },
            ],
          },
        },
      });

      // تحديث الأرصدة
      await tx.account.update({
        where: { id: expenseAccount.id },
        data: { currentBalance: { increment: params.amount } },
      });
      await tx.account.update({
        where: { id: bankAccount.id },
        data: { currentBalance: { decrement: params.amount } },
      });

      return entry;
    });
  }
}
