import type { Role, MemberType, LeaveStatus } from "@prisma/client";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  memberType: MemberType;
  organizationId: string;
  organizationName: string;
};

export type LeaveRequestWithRelations = {
  id: string;
  startDate: Date;
  endDate: Date;
  status: LeaveStatus;
  note: string | null;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    countryCode: string;
    memberType: MemberType;
  };
  leaveType: {
    id: string;
    name: string;
    color: string;
  };
  reviewedBy: {
    id: string;
    name: string;
  } | null;
};

export type TeamMemberWithLeave = {
  id: string;
  name: string;
  email: string;
  role: Role;
  memberType: MemberType;
  countryCode: string;
  leaveRequests: {
    id: string;
    startDate: Date;
    endDate: Date;
    status: LeaveStatus;
    leaveType: {
      name: string;
      color: string;
    };
  }[];
};
