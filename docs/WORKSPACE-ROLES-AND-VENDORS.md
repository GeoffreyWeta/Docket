# Procurement jobs and vendor account visibility

Roles now use a compact table in Super Admin, with purpose, member count and access areas. Role names open their editor; search and starter/custom filters remain. Job recommendations use the server's permission sets.

The suggested procurement chain is Buyer -> Manager -> HOD -> Chief Supply Chain Officer. Manager may report to another manager; the reporting model supports additional levels and rejects cycles. Signing limits remain a per-person approval setting. Finance, CEO and Auditor recommendations do not include reporting-chain workload or signing permissions. They can work outside the procurement chain. Role names, permissions and reporting lines remain customisable.

`configure_procurement_roles` adds six custom jobs (Buyer, Manager, HOD, Chief Supply Chain Officer, Finance, CEO); the existing Auditor starter remains. Re-running preserves edited roles. Existing staff role assignments and reporting lines are retained, including the newly added staff awaiting assignment. Demo seeding creates these job choices too.

Super Admin now displays All vendors and Vendor accounts separately. A Vendors tab lists the register with All vendors, Signed up and Not signed up filters, search and 50-row pagination. Signed up means a linked supplier Profile exists, including a staff account with a separate bidder identity. It does not imply prequalification or permission to bid while blacklisted. No invitations are sent by viewing this list.

Validation: 27 role checks and 57 approval-chain checks passed. Additional checks cover job defaults, independent oversight access, preservation of custom roles, repeat configuration, managers reporting to managers, register/account counts and the admin-only endpoint. Browser checks cover the roles list/editor, vendor filters and counts, pagination, search, blacklist labels, mobile overflow and uncaught errors. Production build and Django system checks pass.
