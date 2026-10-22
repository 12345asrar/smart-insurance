import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('⏳ جاري تهيئة شجرة الحسابات والبيانات الأولية للمنظومة...');

  // 1. شجرة الحسابات القياسية للنظام التأميني
  const accounts = [
    { accountCode: '1101', nameAr: 'حساب البنك والتحصيل الإلكتروني المركزي', accountType: 'ASSET' },
    { accountCode: '1201', nameAr: 'اشتراكات منشآت مستحقة تحت التحصيل', accountType: 'ASSET' },
    { accountCode: '2105', nameAr: 'أمانات تعويضات ومنافع مستحقة الصرف للمؤمن عليهم', accountType: 'LIABILITY' },
    { accountCode: '4101', nameAr: 'إيرادات اشتراكات التأمين الاجتماعي', accountType: 'REVENUE' },
    { accountCode: '5102', nameAr: 'مصروفات المنافع التأمينية - منح الزواج', accountType: 'EXPENSE' },
  ];

  for (const acc of accounts) {
    await prisma.account.upsert({
      where: { accountCode: acc.accountCode },
      update: {},
      create: acc,
    });
  }
  console.log('✅ تم إنشاء شجرة الحسابات بنجاح.');

  // 2. إنشاء منشأة تجريبية
  const establishment = await prisma.establishment.upsert({
    where: { registrationNo: 'EST-10025' },
    update: {},
    create: {
      registrationNo: 'EST-10025',
      name: 'شركة النخبة للتجارة والمقاولات العامة',
      taxNumber: 'TAX-998877',
      commercialRegNo: 'CR-45521',
      phone: '777000111',
      email: 'info@elitenokhba.com',
      address: 'شارع الزبيري - صنعاء',
    },
  });
  console.log(`✅ تم إنشاء المنشأة: ${establishment.name}`);

  // 3. إنشاء مؤمن عليه تجريبي
  const insuredMember = await prisma.insuredMember.upsert({
    where: { nationalId: '010100998877' },
    update: {},
    create: {
      nationalId: '010100998877',
      insuranceNo: 'INS-554433',
      fullName: 'أحمد عبدالله صالح العولقي',
      gender: 'MALE',
      birthDate: new Date('1996-05-15'),
      maritalStatus: 'SINGLE',
      phone: '771234567',
      bankIban: 'YE9000100012345678901234',
    },
  });
  console.log(`✅ تم تسجيل المؤمن عليه: ${insuredMember.fullName}`);

  // 4. تسجيل العامل لدى المنشأة
  await prisma.employmentRecord.create({
    data: {
      establishmentId: establishment.id,
      insuredMemberId: insuredMember.id,
      jobTitle: 'مهندس اتصالات وشبكات',
      basicSalary: 350000,
      allowances: 50000,
      totalSalary: 400000,
      startDate: new Date('2023-01-01'),
      status: 'ACTIVE',
    },
  });
  console.log('✅ تم ربط العامل بالمنشأة وتحديد الأجر التأميني (400,000 ريال).');

  console.log('🎉 اكتملت التهيئة بنجاح!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
