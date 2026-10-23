import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import { PrismaClient } from '@prisma/client';
import { AccountingEngine } from './services/accountingEngine.js';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const accountingEngine = new AccountingEngine(prisma);

app.use(cors());
app.use(express.json());

// تقديم ملفات الواجهة (الجوال والكمبيوتر) سحابياً ومحلياً
app.use(express.static(path.join(process.cwd(), 'public')));
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.static('C:/Users/pc/.gemini/antigravity/scratch/smart-insurance-system/frontend'));
app.use(express.static(path.join(process.cwd(), '../frontend')));

// توجيه الرابط الرئيسي مباشرة إلى بوابة المشتركين
app.get('/', (req: Request, res: Response) => {
  res.redirect('/portal.html');
});

// 1. فحص الاتصال
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ONLINE',
    system: 'Smart Insurance & Automated Financial Core API',
    timestamp: new Date().toISOString(),
  });
});

// 2. جلب البيانات الشاملة (للهاتف والكمبيوتر)
app.get('/api/portal/overview', async (req: Request, res: Response) => {
  try {
    let establishment = await prisma.establishment.findFirst({
      include: {
        workers: {
          include: { insuredMember: true },
          orderBy: { createdAt: 'desc' },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!establishment) {
      establishment = await prisma.establishment.create({
        data: {
          name: 'شركة الصرح للخدمات والتجارة',
          registrationNo: 'EST-202601',
          phone: '770000000',
        },
        include: { workers: { include: { insuredMember: true } }, invoices: true },
      });
    }

    const unpaidInvoices = establishment.invoices.filter((inv) => inv.status === 'UNPAID');
    const totalDue = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.amountDue), 0);

    res.json({
      success: true,
      establishment: {
        id: establishment.id,
        name: establishment.name,
        regNo: establishment.registrationNo,
        phone: establishment.phone,
        totalDue,
        workers: establishment.workers.map((w) => ({
          id: w.id,
          memberId: w.insuredMemberId,
          name: w.insuredMember.fullName,
          insNo: w.insuredMember.insuranceNo,
          job: w.jobTitle,
          salary: Number(w.totalSalary),
          status: w.status,
          date: w.startDate.toISOString().split('T')[0],
        })),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. جلب جميع طلبات منح الزواج للنظامين
app.get('/api/claims', async (req: Request, res: Response) => {
  try {
    const claims = await prisma.benefitClaim.findMany({
      orderBy: { createdAt: 'desc' },
      include: { insuredMember: true },
    });

    res.json({
      success: true,
      data: claims.map((c) => ({
        id: c.id,
        claimNo: c.claimNo,
        workerName: c.insuredMember.fullName,
        doc: c.documentNo || 'عقد زواج رسمي',
        amount: Number(c.calculatedAmount),
        date: c.eventDate.toISOString().split('T')[0],
        status: c.status,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. تسجيل عامل جديد (سواء من الهاتف أو الكمبيوتر)
app.post('/api/workers/register', async (req: Request, res: Response) => {
  try {
    const { name, job, salary } = req.body;
    const est = await prisma.establishment.findFirstOrThrow();

    const member = await prisma.insuredMember.create({
      data: {
        nationalId: `NID-${Date.now().toString().slice(-8)}`,
        insuranceNo: `INS-${Math.floor(10000 + Math.random() * 90000)}`,
        fullName: name,
        gender: 'MALE',
        birthDate: new Date('1995-01-01'),
        phone: '770000000',
        maritalStatus: 'SINGLE',
      },
    });

    const employment = await prisma.employmentRecord.create({
      data: {
        establishmentId: est.id,
        insuredMemberId: member.id,
        jobTitle: job,
        basicSalary: Number(salary),
        totalSalary: Number(salary),
        startDate: new Date(),
        status: 'ACTIVE',
      },
    });

    res.status(201).json({ success: true, member, employment });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 5. استبعاد عامل
app.post('/api/workers/terminate', async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    const emp = await prisma.employmentRecord.update({
      where: { id },
      data: { status: 'TERMINATED', endDate: new Date() },
    });
    res.json({ success: true, emp });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 6. إقرار الرواتب وتوليد القيد الآلي
app.post('/api/wages/declare', async (req: Request, res: Response) => {
  try {
    const est = await prisma.establishment.findFirstOrThrow();
    const activeWorkers = await prisma.employmentRecord.findMany({
      where: { establishmentId: est.id, status: 'ACTIVE' },
    });

    if (activeWorkers.length === 0) {
      return res.status(400).json({ success: false, error: 'لا يوجد عمال نشطون للإقرار عنهم' });
    }

    const totalWages = activeWorkers.reduce((sum, w) => sum + Number(w.totalSalary), 0);
    const employerShare = totalWages * 0.09;
    const employeeShare = totalWages * 0.06;
    const totalAmount = employerShare + employeeShare;

    const declaration = await prisma.wageDeclaration.create({
      data: {
        establishmentId: est.id,
        year: 2026,
        month: 10,
        totalWorkers: activeWorkers.length,
        totalWages,
        employerShare,
        employeeShare,
        totalAmount,
        status: 'CONFIRMED',
      },
    });

    const invoice = await prisma.insuranceInvoice.create({
      data: {
        invoiceNo: `INV-${Date.now().toString().slice(-6)}`,
        establishmentId: est.id,
        wageDeclarationId: declaration.id,
        month: 10,
        year: 2026,
        amountDue: totalAmount,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'UNPAID',
      },
    });

    // توليد القيد المحاسبي التلقائي فوراً
    await accountingEngine.recordWageDeclarationEntry({
      wageDeclarationId: declaration.id,
      establishmentName: est.name,
      month: 10,
      year: 2026,
      totalAmount,
    });

    res.json({ success: true, invoice });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 7. سداد الفاتورة إلكترونياً عن بعد
app.post('/api/payments/pay-invoice', async (req: Request, res: Response) => {
  try {
    const invoice = await prisma.insuranceInvoice.findFirst({
      where: { status: 'UNPAID' },
      include: { establishment: true },
    });

    if (!invoice) {
      return res.status(400).json({ success: false, error: 'لا توجد فواتير مستحقة للسداد' });
    }

    const payment = await prisma.paymentTransaction.create({
      data: {
        transactionNo: `TXN-${Date.now()}`,
        invoiceId: invoice.id,
        amount: invoice.amountDue,
        paymentMethod: 'E_WALLET',
        status: 'SUCCESS',
      },
    });

    await prisma.insuranceInvoice.update({
      where: { id: invoice.id },
      data: { status: 'PAID', amountPaid: invoice.amountDue },
    });

    // توليد قيد القبض المحاسبي الآلي
    await accountingEngine.recordPaymentEntry({
      paymentId: payment.id,
      transactionNo: payment.transactionNo,
      invoiceNo: invoice.invoiceNo,
      establishmentName: invoice.establishment.name,
      amount: Number(invoice.amountDue),
    });

    res.json({ success: true, payment });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 8. تقديم طلب منحة زواج (من الهاتف)
app.post('/api/claims/marriage-grant', async (req: Request, res: Response) => {
  try {
    const { workerId, docNo } = req.body;
    const emp = await prisma.employmentRecord.findUniqueOrThrow({
      where: { id: workerId },
      include: { insuredMember: true },
    });

    const amount = Number(emp.totalSalary) * 2; // راتب شهرين

    const claim = await prisma.benefitClaim.create({
      data: {
        claimNo: `MG-${Math.floor(100 + Math.random() * 900)}`,
        insuredMemberId: emp.insuredMemberId,
        claimType: 'MARRIAGE_GRANT',
        eventDate: new Date(),
        documentNo: docNo || 'عقد زواج رسمي',
        calculatedAmount: amount,
        status: 'SUBMITTED',
      },
    });

    res.json({ success: true, claim });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 9. اعتماد وصرف منحة الزواج (من الكمبيوتر)
app.post('/api/claims/:id/approve', async (req: Request, res: Response) => {
  try {
    const claim = await prisma.benefitClaim.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { insuredMember: true },
    });

    const updated = await prisma.benefitClaim.update({
      where: { id: claim.id },
      data: { status: 'DISBURSED', disbursedAt: new Date() },
    });

    // توليد قيد الصرف المحاسبي الآلي
    await accountingEngine.recordMarriageGrantDisbursementEntry({
      claimId: claim.id,
      claimNo: claim.claimNo,
      beneficiaryName: claim.insuredMember.fullName,
      amount: Number(claim.calculatedAmount),
    });

    res.json({ success: true, updated });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 10. جلب القيود اليومية المحاسبية
app.get('/api/accounting/journal-entries', async (req: Request, res: Response) => {
  try {
    const entries = await prisma.journalEntry.findMany({
      orderBy: { createdAt: 'desc' },
      include: { lines: { include: { account: true } } },
    });
    res.json({ success: true, data: entries });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 11. جلب ميزان المراجعة
app.get('/api/accounting/trial-balance', async (req: Request, res: Response) => {
  try {
    const lines = await prisma.journalLine.findMany();
    const totalDebit = lines.reduce((sum, l) => sum + Number(l.debit), 0);
    const totalCredit = lines.reduce((sum, l) => sum + Number(l.credit), 0);
    res.json({ success: true, totalDebit, totalCredit });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function getLocalIp(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIp();
  console.log('\n====================================================================');
  console.log('   🚀 تم تشغيل سيرفر التأمينات والمالية الذكية بنجاح!');
  console.log('====================================================================');
  console.log(`  📱 رابط الجوال (بوابة المشتركين - افتحه من متصفح الهاتف):`);
  console.log(`     http://${ip}:${PORT}/portal.html\n`);
  console.log(`  💻 رابط الكمبيوتر (النظام الداخلي والمالية ERP - للموظف/المحاسب):`);
  console.log(`     http://localhost:${PORT}/erp.html\n`);
  console.log(`  🏢 رابط المنظومة الشاملة والشهادات الرسمية:`);
  console.log(`     http://localhost:${PORT}/index.html`);
  console.log('====================================================================\n');
});
