import { PrismaClient, Role, MemberType, LeaveStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Clean existing data
  await prisma.leaveRequest.deleteMany();
  await prisma.leavePolicy.deleteMany();
  await prisma.publicHoliday.deleteMany();
  await prisma.user.deleteMany();
  await prisma.leaveType.deleteMany();
  await prisma.organization.deleteMany();

  // Create organization
  const org = await prisma.organization.create({
    data: {
      name: "Acme Global",
      slug: "acme-global",
      onboardingCompleted: true,
    },
  });

  // Hash password for demo users
  const passwordHash = await bcrypt.hash("password123", 10);

  // Create users across 3 countries
  const [ade, wanjiku, chidi, fatima, pedro, amina] = await Promise.all([
    prisma.user.create({
      data: {
        email: "ade@acme.com",
        name: "Ade Okonkwo",
        passwordHash,
        role: Role.ADMIN,
        memberType: MemberType.EMPLOYEE,
        countryCode: "NG",
        organizationId: org.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "wanjiku@acme.com",
        name: "Wanjiku Maina",
        passwordHash,
        role: Role.MANAGER,
        memberType: MemberType.EMPLOYEE,
        countryCode: "KE",
        organizationId: org.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "chidi@acme.com",
        name: "Chidi Eze",
        passwordHash,
        role: Role.MEMBER,
        memberType: MemberType.EMPLOYEE,
        countryCode: "NG",
        organizationId: org.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "fatima@acme.com",
        name: "Fatima Bello",
        passwordHash,
        role: Role.MEMBER,
        memberType: MemberType.CONTRACTOR,
        countryCode: "NG",
        organizationId: org.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "pedro@acme.com",
        name: "Pedro Silva",
        passwordHash,
        role: Role.MEMBER,
        memberType: MemberType.FREELANCER,
        countryCode: "BR",
        organizationId: org.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "amina@acme.com",
        name: "Amina Osei",
        passwordHash,
        role: Role.MEMBER,
        memberType: MemberType.EMPLOYEE,
        countryCode: "KE",
        organizationId: org.id,
      },
    }),
  ]);

  // Create leave types
  const [annual, sick, parental, compassionate] = await Promise.all([
    prisma.leaveType.create({
      data: {
        name: "Annual Leave",
        color: "#3b82f6",
        isPaid: true,
        defaultDays: 20,
        organizationId: org.id,
      },
    }),
    prisma.leaveType.create({
      data: {
        name: "Sick Leave",
        color: "#ef4444",
        isPaid: true,
        defaultDays: 10,
        organizationId: org.id,
      },
    }),
    prisma.leaveType.create({
      data: {
        name: "Parental Leave",
        color: "#8b5cf6",
        isPaid: true,
        defaultDays: 90,
        organizationId: org.id,
      },
    }),
    prisma.leaveType.create({
      data: {
        name: "Compassionate Leave",
        color: "#f59e0b",
        isPaid: true,
        defaultDays: 5,
        organizationId: org.id,
      },
    }),
  ]);

  // Create leave policies per country
  await Promise.all([
    // Nigeria
    prisma.leavePolicy.create({ data: { countryCode: "NG", annualAllowance: 20, carryOverMax: 5, leaveTypeId: annual.id } }),
    prisma.leavePolicy.create({ data: { countryCode: "NG", annualAllowance: 10, carryOverMax: 0, leaveTypeId: sick.id } }),
    // Kenya
    prisma.leavePolicy.create({ data: { countryCode: "KE", annualAllowance: 21, carryOverMax: 5, leaveTypeId: annual.id } }),
    prisma.leavePolicy.create({ data: { countryCode: "KE", annualAllowance: 14, carryOverMax: 0, leaveTypeId: sick.id } }),
    // Brazil
    prisma.leavePolicy.create({ data: { countryCode: "BR", annualAllowance: 30, carryOverMax: 10, leaveTypeId: annual.id } }),
    prisma.leavePolicy.create({ data: { countryCode: "BR", annualAllowance: 15, carryOverMax: 0, leaveTypeId: sick.id } }),
  ]);

  // Create sample leave requests
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  await Promise.all([
    // Chidi is out today (annual leave)
    prisma.leaveRequest.create({
      data: {
        startDate: new Date(year, month, now.getDate() - 1),
        endDate: new Date(year, month, now.getDate() + 2),
        status: LeaveStatus.APPROVED,
        note: "Family vacation",
        userId: chidi.id,
        leaveTypeId: annual.id,
        reviewedById: wanjiku.id,
        reviewedAt: new Date(year, month, now.getDate() - 3),
      },
    }),
    // Fatima is out today (sick)
    prisma.leaveRequest.create({
      data: {
        startDate: new Date(year, month, now.getDate()),
        endDate: new Date(year, month, now.getDate()),
        status: LeaveStatus.APPROVED,
        note: "Not feeling well",
        userId: fatima.id,
        leaveTypeId: sick.id,
        reviewedById: ade.id,
        reviewedAt: new Date(year, month, now.getDate()),
      },
    }),
    // Pedro has upcoming leave next week
    prisma.leaveRequest.create({
      data: {
        startDate: new Date(year, month, now.getDate() + 5),
        endDate: new Date(year, month, now.getDate() + 9),
        status: LeaveStatus.APPROVED,
        note: "Carnival",
        userId: pedro.id,
        leaveTypeId: annual.id,
        reviewedById: wanjiku.id,
        reviewedAt: new Date(year, month, now.getDate() - 7),
      },
    }),
    // Amina has a pending request
    prisma.leaveRequest.create({
      data: {
        startDate: new Date(year, month, now.getDate() + 10),
        endDate: new Date(year, month, now.getDate() + 12),
        status: LeaveStatus.PENDING,
        note: "Wedding",
        userId: amina.id,
        leaveTypeId: compassionate.id,
      },
    }),
  ]);

  // Public holidays - Nigeria 2026
  const ngHolidays = [
    { name: "New Year's Day", date: new Date(2026, 0, 1) },
    { name: "Workers' Day", date: new Date(2026, 4, 1) },
    { name: "Democracy Day", date: new Date(2026, 5, 12) },
    { name: "Independence Day", date: new Date(2026, 9, 1) },
    { name: "Christmas Day", date: new Date(2026, 11, 25) },
    { name: "Boxing Day", date: new Date(2026, 11, 26) },
  ];

  // Public holidays - Kenya 2026
  const keHolidays = [
    { name: "New Year's Day", date: new Date(2026, 0, 1) },
    { name: "Labour Day", date: new Date(2026, 4, 1) },
    { name: "Madaraka Day", date: new Date(2026, 5, 1) },
    { name: "Mashujaa Day", date: new Date(2026, 9, 20) },
    { name: "Jamhuri Day", date: new Date(2026, 11, 12) },
    { name: "Christmas Day", date: new Date(2026, 11, 25) },
  ];

  // Public holidays - Brazil 2026
  const brHolidays = [
    { name: "New Year's Day", date: new Date(2026, 0, 1) },
    { name: "Carnival", date: new Date(2026, 1, 16) },
    { name: "Carnival", date: new Date(2026, 1, 17) },
    { name: "Tiradentes Day", date: new Date(2026, 3, 21) },
    { name: "Labour Day", date: new Date(2026, 4, 1) },
    { name: "Independence Day", date: new Date(2026, 8, 7) },
    { name: "Christmas Day", date: new Date(2026, 11, 25) },
  ];

  // South Africa 2026
  const zaHolidays = [
    { name: "New Year's Day", date: new Date(2026, 0, 1) },
    { name: "Human Rights Day", date: new Date(2026, 2, 21) },
    { name: "Freedom Day", date: new Date(2026, 3, 27) },
    { name: "Workers' Day", date: new Date(2026, 4, 1) },
    { name: "Youth Day", date: new Date(2026, 5, 16) },
    { name: "Heritage Day", date: new Date(2026, 8, 24) },
    { name: "Day of Reconciliation", date: new Date(2026, 11, 16) },
    { name: "Christmas Day", date: new Date(2026, 11, 25) },
  ];

  const allHolidays = [
    ...ngHolidays.map((h) => ({ ...h, countryCode: "NG" })),
    ...keHolidays.map((h) => ({ ...h, countryCode: "KE" })),
    ...brHolidays.map((h) => ({ ...h, countryCode: "BR" })),
    ...zaHolidays.map((h) => ({ ...h, countryCode: "ZA" })),
  ];

  await Promise.all(
    allHolidays.map((h) =>
      prisma.publicHoliday.create({
        data: {
          name: h.name,
          date: h.date,
          countryCode: h.countryCode,
          organizationId: org.id,
        },
      })
    )
  );

  console.log("Seeding complete!");
  console.log(`  Organization: ${org.name}`);
  console.log(`  Users: 6 (across NG, KE, BR)`);
  console.log(`  Leave types: 4`);
  console.log(`  Leave policies: 6`);
  console.log(`  Leave requests: 4`);
  console.log(`  Public holidays: ${allHolidays.length}`);
  console.log("");
  console.log("Demo login: ade@acme.com / password123 (admin)");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
