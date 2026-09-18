# Security Policy

Domino is a multi-tenant flow builder for AI workflows; workspace isolation and data
protection are its most important properties. We take every report
seriously and appreciate the time it takes to make one.

## Reporting a vulnerability

- Email **security@haij.dk** with a description, reproduction steps and the
  impact you believe it has. Danish or English both work.
- Please do not open public issues for security problems, and do not access
  or modify data belonging to workspaces that are not your own test data.
- You will get an acknowledgement within 72 hours and a status update at
  least every two weeks until the issue is resolved.
- We aim to fix confirmed vulnerabilities within 90 days and will credit
  you in the release notes if you want.

There is currently no bug bounty program.

## Scope notes

Particularly interesting: anything that lets one workspace read or write
another workspace's data (RLS bypass), authentication bypass, audit-log
tampering, an invitation link that admits somebody it should not, an AI
proposal that writes something the person did not say yes to or that the
model was talked into by content in a document or a prompt, and injection
of any kind. The RLS test suite in `tests/rls/` is
the executable specification of the isolation model.

## Supported versions

Pre-1.0, only the latest `main` is supported.
