<!-- Last updated: 2026-05-06 — auto-updated from codebase review -->
# GDPR & your leave data

Leave management involves some of the most sensitive personal data your business holds. This page explains what data Coverboard stores, how it is protected, and what your obligations are as the employer.

---

## Why leave data is sensitive

Most HR data — names, contact details, job titles — is standard personal data under UK GDPR. But some leave data is different.

Sickness and absence records can reveal information about an employee's health. Under UK GDPR, health information is classified as **special category data** — it receives a higher level of legal protection than ordinary personal data. Mishandling it can result in fines of up to 4% of your annual global turnover.

This is not theoretical. The ICO (Information Commissioner's Office) actively investigates complaints about mishandled health data, including from employees who feel their medical details were shared without proper controls.

---

## How Coverboard separates sickness data

When someone submits a sickness leave request, Coverboard records two distinct fields on the request:

- **Note** — a general, non-medical note (for example, "covering for me: Chidi") that managers see during approval
- **Sickness note** — a separate, optional special-category field for any health-related context the requester wants to record (symptoms, GP advice, etc.)

The two are stored as separate columns on the leave request so the medical content can be wiped without losing the operational note. The **Evidence provided** flag can also be set on the request to record that a fit note has been received without storing its contents in Coverboard.

**Who can see what:**
- Company **admins** and **managers** — see all leave request fields, including the sickness note. Members can only see their own requests.
- **Employees** — only their own records, never anyone else's.

> Coverboard does not store fit note content (date received, GP name, document image) or return-to-work interview notes today. If you need to retain those, store them in your existing HR document system and use the **Evidence provided** flag in Coverboard to record that they exist.

---

## Audit trail

Every write action on leave requests, team members, leave types and policies, organisation settings, year-end carry-over and Stripe billing is recorded in the audit log. Each entry captures the actor's id, email and role (so the trail survives even after a user is deleted), the action, the resource id, the IP address and the request user agent.

The audit log lives at **/audit** and is available to admins on the **Pro** plan, with CSV export and filters by action, resource and date.

> The audit log captures **writes**, not reads. There is no per-view log of who opened a particular leave request.

---

## Your responsibilities as the employer

Coverboard provides the technical controls, but you are the data controller — meaning the legal responsibility for how data is used sits with you. In practice this means:

**Only collect what you need.** You are not required to know an employee's specific diagnosis. "Respiratory condition" is sufficient — you do not need "asthma" unless there is a specific operational reason.

**Do not share medical details unnecessarily.** A line manager does not need to know why someone is off sick in order to manage their team's workload. Coverboard does not enforce this for you — it is a process matter inside your team.

**Respect employee rights.** Employees have the right to access their own data, request corrections, and in some circumstances request deletion. If an employee makes a Subject Access Request (SAR), you have one month to respond. Their own request and balance data is visible to them in-app; for a full export, contact support.

**Store data only as long as necessary.** Coverboard provides a retention endpoint that anonymises records older than your configured cutoff (default **6 years** after the leave end date — the standard UK recommendation). You can override the period (1–20 years) and run a `dryRun=true` preview before committing. Personal notes and sickness notes are wiped; statutory fields (dates, leave type, SSP/SMP figures) are preserved so historical pay records remain reportable.

---

## Data storage and security

Your data residency is configurable under **Settings → UK Compliance → Data residency** (UK, EU or US — defaults to EU). When set to UK, a "Data stored in UK servers." trust label appears on the settings page. Coverboard uses role-based access controls (admin / manager / member), encrypted data storage, and an append-only audit log of write actions. If you are asked during a CQC inspection or an employment tribunal whether your HR data is handled securely, you can point to these controls directly.

> Custom data residency configuration is a **Pro** plan feature.

---

## Account deletion

Admins can request deletion of the entire organisation under **Settings → Danger zone → Delete account and all data**. Deletion is not immediate — it enters a **30-day grace period** (logged to a tamper-evident audit). During the grace period, an admin can cancel by contacting support. After 30 days, a daily cron job purges all team member, leave request, audit, and integration data; the organisation row is anonymised to a stub. See [Data deletion and trial expiry flow](data-deletion-and-trial-expiry.md) for the full lifecycle.

---

## Frequently asked questions

**Can employees see their own absence records?**
Yes. Employees can view their own absence history and their own holiday pay rate from **Settings → Profile**. They cannot see anyone else's data.

**What if an employee asks us to delete their sickness records?**
The right to erasure under UK GDPR is not absolute. You are permitted to retain records for as long as is necessary for a legitimate purpose — employment records are typically retained for 6 years after the employment ends in case of a tribunal claim. The data retention endpoint (above) anonymises personal and sickness notes while preserving the statutory shell of the record. If an employee requests full deletion, seek legal advice before acting.

**What happens to data when we offboard an employee?**
The employee's record is marked as inactive but not deleted. Their data remains available for the configured retention period, then becomes eligible for anonymisation when an admin runs the data retention process. You remain in control of when it is anonymised.

**Is Coverboard GDPR compliant?**
Coverboard is built with UK GDPR compliance in mind — separated storage for sickness notes, role-based access, an append-only audit log of writes, configurable data residency, and a retention/anonymisation endpoint. However, GDPR compliance is ultimately your responsibility as the data controller, not just a feature of the software you use.
